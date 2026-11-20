// Team beheren vanaf de pagina Instellingen (alleen beheerders).
// POST { leden: [{ email, naam, functie?, role: 'admin'|'medewerker', rechten }] }
// POST { uitnodigen: email } → de inlogmail (opnieuw) sturen naar iemand die al in het team staat
// Zet of wijzigt de rij in allowed_users, maakt voor nieuwe mensen een account aan (inloggen met een code uit de mail)
// en trekt het profiel gelijk, zodat een nieuw niveau of nieuwe rechten meteen gelden.
import { sb, env, verifyUser } from '../lib/rise.mts'
import { html, mailGekoppeld, riseMail, stuurMail } from '../lib/mail.mts'

interface Lid { email: string; naam: string; functie?: string; role: 'admin' | 'medewerker' | 'uit'; rechten: Record<string, boolean> }

const RECHTEN = ['taken_alle', 'taken_anderen', 'vertrouwelijk', 'verwijderen', 'crm', 'crm_bewerken', 'klanten', 'klanten_bewerken', 'klanttaken', 'portaaltoegang', 'geld', 'statistieken', 'projecten']
const slugVan = (naam: string) => naam.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'lid'

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Alleen POST', { status: 405 })
  const me = await verifyUser(req.headers.get('x-supabase-token'))
  if (!me || me.role !== 'admin') return new Response('Alleen beheerders kunnen het team aanpassen', { status: 401 })
  const body = ((await req.json().catch(() => ({}))) ?? {}) as { leden?: Lid[]; uitnodigen?: string }
  const door = me.person.charAt(0).toUpperCase() + me.person.slice(1)

  // Alleen de inlogmail (opnieuw) sturen
  if (typeof body.uitnodigen === 'string') {
    const email = body.uitnodigen.trim().toLowerCase()
    const [lid] = await sb<{ email: string; naam: string | null; role: string }[]>(`allowed_users?select=email,naam,role&email=eq.${encodeURIComponent(email)}`)
    if (!lid || lid.role === 'client' || lid.role === 'uit') return new Response('Deze persoon staat niet (meer) in het team', { status: 404 })
    if (!mailGekoppeld()) return new Response('De mailserver is niet gekoppeld', { status: 503 })
    await uitnodiging(email, lid.naam ?? '', door)
    return Response.json({ ok: true, gemaild: [email] })
  }

  const { leden } = body
  if (!Array.isArray(leden) || !leden.length) return new Response('Geen wijzigingen', { status: 400 })

  const bestaand = await sb<{ email: string; person: string | null; role: string }[]>('allowed_users?select=email,person,role')
  const gemaild: string[] = []
  const personen = new Set(bestaand.map((b) => b.person).filter(Boolean))
  const uit: string[] = []

  for (const l of leden) {
    const email = (l.email ?? '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return new Response(`Ongeldig mailadres: ${email}`, { status: 400 })
    if (!['admin', 'medewerker', 'uit'].includes(l.role)) return new Response(`Onbekend niveau voor ${email}`, { status: 400 })
    const oud = bestaand.find((b) => b.email.toLowerCase() === email)
    if (oud?.role === 'client') return new Response(`${email} is een klantlogin`, { status: 409 })
    // Je kunt jezelf geen beheerder-af maken (anders kan niemand het meer terugzetten)
    if (oud && oud.person === me.person && l.role !== 'admin') return new Response('Je kunt je eigen niveau niet verlagen of intrekken', { status: 409 })

    let person = oud?.person
    if (!person) {
      const basis = slugVan(l.naam || email.split('@')[0])
      person = basis
      for (let i = 2; personen.has(person); i++) person = `${basis}-${i}`
      personen.add(person)
    }
    // Alleen aangeraakte vinkjes opslaan; wat ontbreekt valt terug op de standaard
    const rechten = Object.fromEntries(RECHTEN.filter((r) => typeof l.rechten?.[r] === 'boolean').map((r) => [r, !!l.rechten[r]]))
    await sb('allowed_users', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ email, person, role: l.role, naam: (l.naam ?? '').trim() || person, functie: l.functie?.trim() || null, rechten }),
    })

    if (!oud) {
      // Nieuw: account aanmaken (bevestigd, zonder mail); inloggen gaat met een code uit de mail
      const key = env('SUPABASE_SERVICE_ROLE_KEY')
      const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, email_confirm: true }),
      })
      if (!res.ok && res.status !== 422) return new Response(`Account aanmaken voor ${email} lukte niet (${res.status})`, { status: 502 })
      // Laat de nieuwe collega weten dat er een account is en hoe inloggen werkt
      if (l.role !== 'uit' && mailGekoppeld()) {
        try { await uitnodiging(email, l.naam ?? '', door); gemaild.push(email) } catch (e) { console.error('Uitnodiging niet verstuurd', email, (e as Error).message) }
      }
    }
    await sb('rpc/sync_profile', { method: 'POST', body: JSON.stringify({ p_email: email }) })
    // Toegang ingetrokken: inloggen blokkeren (en bestaande sessies laten verlopen); teruggegeven: weer vrijgeven
    if (oud && (l.role === 'uit') !== (oud.role === 'uit')) {
      const [gebruiker] = await sb<{ user_id: string }[]>(`profiles?select=user_id&email=eq.${encodeURIComponent(email)}`)
      if (gebruiker) {
        const key = env('SUPABASE_SERVICE_ROLE_KEY')
        await fetch(`${env('SUPABASE_URL')}/auth/v1/admin/users/${gebruiker.user_id}`, {
          method: 'PUT',
          headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
          body: JSON.stringify({ ban_duration: l.role === 'uit' ? '876000h' : 'none' }),
        })
      }
    }
    uit.push(email)
  }
  return Response.json({ ok: true, opgeslagen: uit, gemaild })
}

const APP = 'https://app.risevideomarketing.nl'

/** Inlogmail voor een nieuwe collega: waar, met welk adres, en dat er een code in de mail komt (geen wachtwoord). */
async function uitnodiging(email: string, naam: string, door: string) {
  const voornaam = (naam || '').trim().split(/\s+/)[0]
  const stap = (n: number, t: string) => `<tr><td style="vertical-align:top;padding:6px 12px 6px 0;font-weight:bold;color:#08111F">${n}</td><td style="padding:6px 0;font-size:15px;line-height:1.5;color:#3B4656">${t}</td></tr>`
  const lijst = `<table role="presentation" style="border-collapse:collapse;margin:0 0 4px">${stap(1, `Ga naar <a href="${APP}" style="color:#08111F">app.risevideomarketing.nl</a>`)}${stap(2, `Vul je mailadres in: <strong>${html(email)}</strong>`)}${stap(3, 'Je krijgt een mail met een code. Typ die in en je bent binnen.')}</table>`
  await stuurMail({
    aan: [email],
    onderwerp: 'Je hebt toegang tot het Rise-dashboard',
    html: riseMail({
      titel: voornaam ? `Welkom, ${html(voornaam)}` : 'Welkom bij Rise Video Marketing',
      intro: `${html(door)} heeft je toegevoegd aan het dashboard van Rise Video Marketing. Inloggen gaat zonder wachtwoord, met een code uit je mail.`,
      blokHtml: lijst,
      knop: 'Inloggen',
      url: APP,
      naKnop: 'Werkt de code niet? Vraag Daan om je toegang te controleren.',
    }),
    tekst: `${voornaam ? `Welkom, ${voornaam}` : 'Welkom'}

${door} heeft je toegevoegd aan het dashboard van Rise Video Marketing.

1. Ga naar ${APP}
2. Vul je mailadres in: ${email}
3. Je krijgt een mail met een code. Typ die in en je bent binnen.

Werkt de code niet? Vraag Daan om je toegang te controleren.`,
  })
}
