// Afmelden voor taakmails, via de link onderaan de mail (of de afmeldknop van Gmail/Outlook).
// GET  ?k=<klant>&e=<mail>&t=<handtekening>            → afmelden en een bevestigingspagina tonen
// GET  ...&opnieuw=1                                     → weer aanmelden
// POST (One-Click, RFC 8058) met dezelfde query          → afmelden zonder pagina
// De handtekening voorkomt dat iemand anders een adres kan afmelden. De taken blijven gewoon in het portaal.
import { timingSafeEqual } from 'node:crypto'
import { sb, teken } from '../lib/rise.mts'

const pagina = (titel: string, tekst: string, link?: { href: string; label: string }) => new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titel} · Rise Video Marketing</title><link rel="icon" href="/img/favicon.svg"></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(180deg,#d3dde6,#efebe4);font-family:Arial,Helvetica,sans-serif;color:#08111F">
<div style="background:#fff;border-radius:18px;padding:36px;max-width:420px;margin:24px;box-shadow:0 6px 16px rgba(8,17,31,.08)">
<img src="/img/logo-navy.png" alt="Rise Video Marketing" width="150" style="display:block;margin-bottom:20px">
<h1 style="font-size:22px;margin:0 0 10px">${titel}</h1><p style="font-size:15px;line-height:1.55;color:#3B4656;margin:0">${tekst}</p>
${link ? `<p style="margin:22px 0 0"><a href="${link.href}" style="color:#3E63DD;font-size:14px">${link.label}</a></p>` : ''}
</div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })

export default async (req: Request) => {
  const u = new URL(req.url)
  const klant = u.searchParams.get('k') ?? ''
  const email = (u.searchParams.get('e') ?? '').trim().toLowerCase()
  const t = u.searchParams.get('t') ?? ''
  const goed = teken(`${klant}:${email}`)
  if (!klant || !email || t.length !== goed.length || !timingSafeEqual(Buffer.from(t), Buffer.from(goed))) {
    return req.method === 'POST' ? new Response('Ongeldige link', { status: 400 }) : pagina('Deze link klopt niet', 'Gebruik de link uit de laatste mail, of mail ons op hello@risevideomarketing.nl.')
  }
  const opnieuw = u.searchParams.get('opnieuw') === '1'

  const [rij] = await sb<{ data: { name?: string; mailUit?: string[] } }[]>(`clients?select=data&id=eq.${encodeURIComponent(klant)}`)
  if (!rij) return pagina('Niet gevonden', 'We konden je gegevens niet vinden. Mail ons gerust op hello@risevideomarketing.nl.')
  const huidig = (rij.data.mailUit ?? []).map((e) => e.toLowerCase())
  const mailUit = opnieuw ? huidig.filter((e) => e !== email) : Array.from(new Set([...huidig, email]))
  await sb(`clients?id=eq.${encodeURIComponent(klant)}`, { method: 'PATCH', body: JSON.stringify({ data: { ...rij.data, mailUit }, updated_at: new Date().toISOString(), updated_by: null }) })

  if (req.method === 'POST') return new Response('ok')
  const terug = new URLSearchParams({ k: klant, e: email, t })
  return opnieuw
    ? pagina('Je bent weer aangemeld', `Je krijgt weer een mail als we iets voor je klaarzetten in je portaal.`, { href: `?${terug}`, label: 'Toch geen meldingen' })
    : pagina('Je bent afgemeld', `Je krijgt geen mails meer over nieuwe taken. Ze blijven wel gewoon in je portaal staan, op <a href="https://app.risevideomarketing.nl" style="color:#3E63DD">app.risevideomarketing.nl</a>.`, { href: `?${terug}&opnieuw=1`, label: 'Toch weer meldingen ontvangen' })
}
