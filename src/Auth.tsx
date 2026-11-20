import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Client, PersonId } from './data/types'
import { PortaalView } from './pages/Portaal'
import { klantContent, klantTaakAf, klantVraag } from './slack'
import { StoreProvider } from './store'
import { linkFoutUitUrl, supabase } from './supabase'

interface Profile {
  person: PersonId
  role: string
  email: string
  client_id?: string | null
}

/** app.risevideomarketing.nl: zelfde app, maar het inlogscherm praat tegen klanten. */
const IS_PORTAL = window.location.hostname.startsWith('portal.')

/** Zonder Supabase: demostand. Met Supabase: eerst inloggen, dan het dashboard met eigen profiel. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) return
    setProfile(undefined)
    supabase
      .from('profiles')
      .select('person, role, email, client_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setProfile((data as Profile) ?? null))
  }, [session])

  if (!supabase) return <StoreProvider>{children}</StoreProvider>
  if (session === undefined || (session && profile === undefined)) return <Splash text="Laden…" />
  if (!session) return <Login />
  if (profile?.role === 'client' && profile.client_id) return <KlantPortaal clientId={profile.client_id} email={session.user.email ?? ''} />
  if (!profile || !['admin', 'medewerker', 'sales'].includes(profile.role)) {
    return (
      <Splash text={`${session.user.email} heeft nog geen toegang tot het dashboard. Vraag Daan om je toe te voegen.`}>
        <button className="btn" onClick={() => supabase!.auth.signOut()}>Uitloggen</button>
      </Splash>
    )
  }
  return (
    <StoreProvider live me={profile.person} userId={session.user.id}>
      {children}
    </StoreProvider>
  )
}

/** Ingelogde klant: alleen het eigen portaal, alleen lezen (Row Level Security laat niets anders door). */
function KlantPortaal({ clientId, email }: { clientId: string; email: string }) {
  const [client, setClient] = useState<Client | null | undefined>(undefined)
  useEffect(() => {
    supabase!.from('clients').select('data').eq('id', clientId).maybeSingle()
      .then(({ data }) => setClient((data?.data as Client) ?? null))
  }, [clientId])
  if (client === undefined) return <Splash text="Laden…" />
  if (!client) {
    return (
      <Splash text={`Voor ${email} staat nog geen portaal klaar. Neem contact op met Rise Video Marketing.`}>
        <button className="btn" onClick={() => supabase!.auth.signOut()}>Uitloggen</button>
      </Splash>
    )
  }
  return (
    <div className="portal-standalone">
      <PortaalView
        client={client}
        actions={<button className="link small portal-logout" onClick={() => supabase!.auth.signOut()}>Uitloggen</button>}
        onTaak={async (id, gedaan) => {
          const r = await klantTaakAf(id, gedaan)
          if (!r.ok) return `Dat lukte niet: ${r.fout ?? 'onbekende fout'}`
          setClient({ ...client, klantTaken: r.klantTaken })
        }}
        onContent={async (body) => {
          const r = await klantContent(body)
          if (!r.ok) return r.fout ?? 'Dat lukte niet'
          setClient({ ...client, contentPlekken: r.contentPlekken })
        }}
        onVraag={async (tekst) => {
          const r = await klantVraag(tekst)
          if (!r.ok) return r.fout ?? 'Versturen lukte niet'
          setClient({ ...client, hulpvragen: r.hulpvragen })
        }}
      />
    </div>
  )
}

function Splash({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/img/logo-navy.png" alt="Rise Video Marketing" className="login-logo" />
        <p className="muted">{text}</p>
        {children}
      </div>
    </div>
  )
}

/** Supabase-fout in gewone taal. */
function uitleg(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('rate limit') || m.includes('only request this after'))
    return 'Er zijn net te veel inlogmails verstuurd. Gebruik de code uit de laatste mail, of wacht een paar minuten.'
  if (m.includes('expired') || m.includes('invalid') || m.includes('not found'))
    return 'Deze code of link is verlopen of al gebruikt. Alleen de nieuwste mail werkt: vraag zo nodig een nieuwe aan.'
  if (m.includes('fetch') || m.includes('network'))
    return 'Geen verbinding met de inlogserver. Check je internet en probeer het opnieuw.'
  if (m.includes('signups not allowed') || m.includes('user not found'))
    return 'Dit adres heeft geen toegang. Vraag Daan om je toe te voegen.'
  return msg
}

/** Kwam je binnen via een verlopen of al gebruikte link? Dan stond de fout in de URL. */
function linkFout(): string {
  if (!linkFoutUitUrl) return ''
  if (window.location.hash.includes('error')) history.replaceState(null, '', window.location.pathname)
  return uitleg(linkFoutUitUrl)
}

/**
 * Inloggen met een code uit de mail (werkt op elk apparaat, ook als de mail-app de link al heeft geopend)
 * of met de link in dezelfde mail.
 */
function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('rise-login-email') ?? '')
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'checking'>('idle')
  const [error, setError] = useState(linkFout)

  const send = async () => {
    if (!supabase || !email.trim()) return
    setState('sending')
    setError('')
    localStorage.setItem('rise-login-email', email.trim())
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Alleen bestaande (uitgenodigde) gebruikers; nieuwe accounts maak je in Supabase aan
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    })
    if (error) {
      setError(uitleg(error.message))
      // Bij te veel mails kan de code uit een eerdere mail nog werken
      setState(error.message.toLowerCase().includes('rate limit') ? 'sent' : 'idle')
    } else setState('sent')
  }

  const check = async () => {
    const token = code.replace(/\D/g, '')
    if (!supabase || token.length < 6) return
    setState('checking')
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' })
    if (error) {
      setError(uitleg(error.message))
      setState('sent')
    }
    // Gelukt: onAuthStateChange in AuthGate pakt de sessie op
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/img/logo-navy.png" alt="Rise Video Marketing" className="login-logo" />
        <h1>{IS_PORTAL ? 'Klantportaal' : 'Inloggen'}</h1>
        {state === 'sent' || state === 'checking' ? (
          <>
            <p>Check je mail: we hebben een inlogknop gestuurd naar <strong>{email}</strong>. Klik erop en je bent binnen.</p>
            <p className="muted small">Opent de mail op een ander apparaat? Vul dan hier de code uit dezelfde mail in.</p>
            <input inputMode="numeric" autoComplete="one-time-code" placeholder="Code uit de mail" value={code} autoFocus
              onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && check()} />
            <button className="btn primary wide" onClick={check} disabled={state === 'checking' || code.replace(/\D/g, '').length < 6}>
              {state === 'checking' ? 'Controleren…' : 'Inloggen'}
            </button>
            <button className="link small" onClick={() => { setState('idle'); setCode(''); setError('') }}>Ander adres of nieuwe mail</button>
          </>
        ) : (
          <>
            <p className="muted">Vul je mailadres in. Je krijgt een mail met een inlogknop, geen wachtwoord nodig. Daarna blijf je op dit apparaat ingelogd.</p>
            <input type="email" autoComplete="email" placeholder="naam@jouworganisatie.nl" value={email} autoFocus
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
            <button className="btn primary wide" onClick={send} disabled={state === 'sending' || !email.trim()}>
              {state === 'sending' ? 'Versturen…' : 'Stuur inlogmail'}
            </button>
          </>
        )}
        {error && <p className="late small">{error}</p>}
      </div>
    </div>
  )
}
