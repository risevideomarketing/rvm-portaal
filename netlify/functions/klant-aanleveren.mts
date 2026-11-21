// De klant levert iets aan vanuit het portaal: een link, een bestand of een datum (deadline/planning).
// Komt bij de klant in het dossier, als taak "Door klant aangeleverd" bij het team en als melding in Slack.
// POST met header X-Supabase-Token:
//   { soort: 'uploadplek', naam }                       → tijdelijke upload-URL voor één bestand (direct naar de opslag)
//   { soort: 'link', titel, url }
//   { soort: 'bestand', titel, pad, naam, type, grootte } (na het uploaden)
//   { soort: 'datum', titel, datum }
import { SITE, channel, env, sb, verifyAny } from '../lib/rise.mts'

const MAX_MB = 50
const veilig = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80)
const kort = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n)

/** Datum (YYYY-MM-DD) een paar werkdagen vooruit. */
function werkdagen(n: number) {
  const d = new Date()
  while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n-- }
  return d.toISOString().slice(0, 10)
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Alleen POST', { status: 405 })
  const token = req.headers.get('x-supabase-token')
  const me = await verifyAny(token)
  if (!me?.client_id) return new Response('Alleen voor klanten', { status: 401 })
  const b = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  const klant = me.client_id

  if (b.soort === 'uploadplek') {
    const pad = `klant/${klant}/aangeleverd/${crypto.randomUUID().slice(0, 8)}-${veilig(kort(b.naam, 120) || 'bestand')}`
    const res = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/upload/sign/bestanden/${pad}`, {
      method: 'POST',
      headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) return new Response(`Uploaden kan nu niet (${res.status})`, { status: 502 })
    const { url } = (await res.json()) as { url: string }
    return Response.json({ pad, url: `${env('SUPABASE_URL')}/storage/v1${url}` })
  }

  const [rij] = await sb<{ data: Record<string, any> }[]>(`clients?select=data&id=eq.${encodeURIComponent(klant)}`)
  if (!rij) return new Response('Klant niet gevonden', { status: 404 })
  const data = rij.data
  const nu = new Date().toISOString()
  const id = crypto.randomUUID().slice(0, 8)
  const gebruiker = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${token}` } })
  const email = gebruiker.ok ? ((await gebruiker.json()) as { email?: string }).email : undefined
  const titel = kort(b.titel, 120)
  let taakTitel = ''
  let deadline = werkdagen(1)
  let slackRegel = ''

  if (b.soort === 'link') {
    const ruw = kort(b.url, 1000)
    const url = /^https?:\/\//i.test(ruw) ? ruw : `https://${ruw}`
    try { const u = new URL(url); if (u.protocol !== 'https:' || !u.hostname.includes('.')) throw new Error() } catch { return new Response('Dat is geen geldige link (begin met https://)', { status: 400 }) }
    const naam = titel || new URL(url).hostname.replace(/^www\./, '')
    data.links = [...(data.links ?? []), { id, title: naam, url, klant: true, at: nu, doorKlant: true, email }]
    taakTitel = `Door klant aangeleverd: ${naam}`
    slackRegel = `:link: <${url}|${naam}>`
  } else if (b.soort === 'bestand') {
    const pad = kort(b.pad, 300)
    if (!pad.startsWith(`klant/${klant}/aangeleverd/`)) return new Response('Ongeldig bestand', { status: 400 })
    const grootte = Number(b.grootte) || 0
    if (grootte > MAX_MB * 1024 * 1024) return new Response(`Maximaal ${MAX_MB} MB per bestand`, { status: 400 })
    const naam = kort(b.naam, 120) || 'Bestand'
    data.bestanden = [...(data.bestanden ?? []), { id, naam: titel ? `${titel} (${naam})` : naam, pad, type: kort(b.type, 100) || 'application/octet-stream', grootte, at: nu, doorKlant: true, email }]
    taakTitel = `Door klant geüpload: ${titel || naam}`
    slackRegel = `:paperclip: ${titel || naam}`
  } else if (b.soort === 'datum') {
    const datum = kort(b.datum, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return new Response('Kies een datum', { status: 400 })
    if (!titel) return new Response('Waar gaat de datum over?', { status: 400 })
    data.planning = [...(data.planning ?? []), { id, date: datum, title: titel, doorKlant: true }]
    taakTitel = `Door klant gepland: ${titel}`
    deadline = datum
    slackRegel = `:calendar: ${titel} op ${new Date(`${datum}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`
  } else {
    return new Response('Onbekende soort', { status: 400 })
  }

  await sb(`clients?id=eq.${encodeURIComponent(klant)}`, { method: 'PATCH', body: JSON.stringify({ data, updated_at: nu, updated_by: null }) })
  const taak = { id: `kl-${id}`, title: taakTitel, priority: 'middel', soort: 'Klantwerk', deadline, assignee: 'daan', status: 'todo', inAgenda: true, comments: [], clientId: klant, contactId: data.contactId, doorKlant: true, description: email ? `Aangeleverd door ${email} via het portaal.` : 'Aangeleverd via het portaal.', updatedAt: nu }
  await sb('tasks', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: taak.id, data: taak, updated_at: nu }) })
  await channel(`:inbox_tray: *${data.name ?? 'Een klant'}* heeft iets aangeleverd${email ? ` (${email})` : ''}\n${slackRegel}\n<${SITE}/#/klanten/${klant}|Open het klantdossier>`).catch((e) => console.error('Slack mislukt', e))
  return Response.json({ ok: true, links: data.links ?? [], bestanden: data.bestanden ?? [], planning: data.planning ?? [] })
}
