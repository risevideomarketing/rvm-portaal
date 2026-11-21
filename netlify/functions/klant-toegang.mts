// Geeft iemand van een klant toegang tot het eigen portaal op app.risevideomarketing.nl.
// Alleen voor admins. POST { clientId, email } met header X-Supabase-Token.
// 1. zet het adres in allowed_users (rol client, gekoppeld aan de klant)
// 2. maakt het account aan (bevestigd, zonder mail); inloggen gaat daarna met een code uit de mail
import { html, mailGekoppeld, mailPunt, riseMail, stuurMail, voornaam } from '../lib/mail.mts'
import { env, heeftRecht, sb, verifyUser } from '../lib/rise.mts'

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Alleen POST', { status: 405 })
  const me = await verifyUser(req.headers.get('x-supabase-token'))
  if (!me || !(await heeftRecht(me.person, me.role, 'portaaltoegang'))) return new Response('Je mag geen portaaltoegang geven', { status: 401 })

  const { clientId, email: raw, naam = '', welkom = true } = (await req.json()) as { clientId?: string; email?: string; naam?: string; welkom?: boolean }
  const email = (raw ?? '').trim().toLowerCase()
  if (!clientId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return new Response('Klant of mailadres ontbreekt', { status: 400 })

  const [client] = await sb<{ id: string; data: { name: string; strippenkaart?: unknown } }[]>(`clients?select=id,data&id=eq.${encodeURIComponent(clientId)}`)
  if (!client) return new Response('Klant niet gevonden', { status: 404 })

  const [bestaand] = await sb<{ role: string; client_id: string | null }[]>(`allowed_users?select=role,client_id&email=eq.${encodeURIComponent(email)}`)
  if (bestaand && bestaand.role !== 'client') return new Response('Dit adres is van een teamlid', { status: 409 })
  if (bestaand && bestaand.client_id !== clientId) return new Response('Dit adres heeft al toegang tot een andere klant', { status: 409 })

  await sb('allowed_users', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ email, role: 'client', client_id: clientId }),
  })

  // Account aanmaken via de Auth-admin-API; bestaat het al, dan is dat prima
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, email_confirm: true }),
  })
  if (!res.ok && res.status !== 422) return new Response(`Account aanmaken lukte niet (${res.status})`, { status: 502 })

  // Bestond het account al (422), zorg dan dat het profiel klopt; anders deed de trigger dat al
  if (res.status === 422) {
    await sb('rpc/sync_profile', { method: 'POST', body: JSON.stringify({ p_email: email }) })
  }

  // Persoonlijke welkomstmail: de klant moet zich direct welkom en in goede handen voelen
  let gemaild = false
  if (welkom && mailGekoppeld()) {
    const vn = voornaam(naam)
    const bedrijf = client.data.name
    const punten = [
      mailPunt('Waar we nu aan werken', 'Per productie zie je precies in welke fase we zitten en wanneer je iets kunt verwachten.'),
      mailPunt("Je video's", 'Alles wat we opleveren staat op één plek, klaar om te bekijken, te delen en te downloaden.'),
      mailPunt('Planning', 'Draaidagen, opleveringen en belangrijke momenten in één overzicht.'),
      ...(client.data.strippenkaart ? [mailPunt('Je strippenkaart', 'Je ziet altijd hoeveel strippen je nog hebt en wat we er al mee gemaakt hebben.')] : []),
      mailPunt('Bestanden en facturen', 'Netjes bij elkaar, zonder zoeken in je mail.'),
    ].join('')
    try {
      await stuurMail({
        aan: [email],
        onderwerp: `${vn ? `${vn}, je` : 'Je'} persoonlijke Rise-portaal staat klaar`,
        html: riseMail({
          aanhef: vn ? `Beste ${html(vn)},` : 'Beste,',
          titel: `Welkom in je portaal voor ${html(bedrijf)}`,
          intro: 'We hebben iets nieuws voor je: je eigen Rise-app. Al je projecten, content, video\'s en belangrijke informatie staan daar overzichtelijk op één plek. Altijd bij de hand, op je laptop én je telefoon.',
          blokHtml: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 6px;border-collapse:collapse">${punten}</table>
            <div style="background:#F3F3F3;border-radius:16px;padding:18px 22px;margin:22px 0 0">
              <p style="font-size:14px;line-height:1.6;margin:0;color:#3B4656"><strong style="color:#0C1625">Zo log je in</strong><br>Ga naar app.risevideomarketing.nl en vul ${html(email)} in. Je krijgt dan meteen een inlogcode in je mail. Geen wachtwoord nodig, en je blijft daarna ingelogd. </p>
              <p style="font-size:14px;line-height:1.6;margin:12px 0 0;color:#3B4656"><strong style="color:#0C1625">Tip</strong><br>Zet je portaal meteen in je bladwijzers (⌘D op Mac, Ctrl+D op Windows), dan heb je het altijd binnen één klik. Op je telefoon: Delen → Zet op beginscherm, dan staat het er als een echte app.</p>
            </div>`,
          knop: 'Open je portaal',
          url: 'https://app.risevideomarketing.nl',
          naKnop: 'Vragen, wensen of een idee? Je kunt ons altijd bellen of mailen, of een berichtje sturen vanuit je portaal. We reageren dezelfde werkdag.',
        }),
        tekst: [
          vn ? `Beste ${vn},` : 'Beste,',
          '',
          `We hebben iets nieuws voor je: je eigen Rise-app voor ${bedrijf}. Je ziet daar waar we aan werken, je video's, de planning${client.data.strippenkaart ? ', je strippenkaart' : ''} en je bestanden en facturen. Jij hoeft niets te doen: wij houden het voor je bij.`,
          '',
          `Inloggen: ga naar https://app.risevideomarketing.nl en vul ${email} in. Je krijgt meteen een inlogcode in je mail.`,
          '',
          'Hartelijke groet,',
          'Daan Schuurmans',
          'Rise Video Marketing · +31 6 40 75 01 13',
        ].join('\n'),
      })
      gemaild = true
    } catch (e) {
      console.error('Welkomstmail mislukt', e)
    }
  }
  return Response.json({ ok: true, gemaild })
}
