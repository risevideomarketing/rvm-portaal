// De klant beheert zijn contentplekken in het portaal (Drive, SharePoint, Dropbox…).
// POST { actie: 'toevoegen', titel, url } of { actie: 'weg', id } met header X-Supabase-Token.
// Klanten mogen hun klantrij alleen lezen; deze functie voegt alleen een link toe of haalt een link weg die de klant zelf toevoegde.
import { channel, sb, verifyAny } from '../lib/rise.mts'

interface ContentPlek { id: string; title: string; url: string; door: 'rise' | 'klant'; email?: string; at: string }

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Alleen POST', { status: 405 })
  const token = req.headers.get('x-supabase-token')
  const me = await verifyAny(token)
  if (!me?.client_id) return new Response('Alleen voor klanten', { status: 401 })
  const body = ((await req.json().catch(() => ({}))) ?? {}) as { actie?: string; titel?: string; url?: string; id?: string }

  const [rij] = await sb<{ data: { name?: string; contentPlekken?: ContentPlek[] } }[]>(`clients?select=data&id=eq.${encodeURIComponent(me.client_id)}`)
  if (!rij) return new Response('Klant niet gevonden', { status: 404 })
  const plekken = rij.data.contentPlekken ?? []
  const nu = new Date().toISOString()
  let nieuw: ContentPlek[]

  if (body.actie === 'toevoegen') {
    const ruw = (body.url ?? '').trim()
    const url = /^https?:\/\//i.test(ruw) ? ruw : `https://${ruw}`
    try {
      const u = new URL(url)
      if (u.protocol !== 'https:' || !u.hostname.includes('.')) throw new Error()
    } catch {
      return new Response('Dat is geen geldige link (begin met https://)', { status: 400 })
    }
    const titel = (body.titel ?? '').trim().slice(0, 80) || new URL(url).hostname.replace(/^www\./, '')
    nieuw = [...plekken, { id: crypto.randomUUID().slice(0, 8), title: titel, url, door: 'klant', email: await mailVan(token), at: nu }]
    // Team laten weten dat er een contentplek bij is (mag mislukken)
    await channel(`:link: ${rij.data.name ?? 'Een klant'} heeft een contentplek toegevoegd: <${url}|${titel}>`).catch(() => undefined)
  } else if (body.actie === 'weg') {
    const plek = plekken.find((p) => p.id === body.id)
    if (!plek) return new Response('Link niet gevonden', { status: 404 })
    if (plek.door !== 'klant') return new Response('Deze link is door Rise toegevoegd; vraag ons hem weg te halen.', { status: 403 })
    nieuw = plekken.filter((p) => p.id !== body.id)
  } else {
    return new Response('Onbekende actie', { status: 400 })
  }

  await sb(`clients?id=eq.${encodeURIComponent(me.client_id)}`, { method: 'PATCH', body: JSON.stringify({ data: { ...rij.data, contentPlekken: nieuw }, updated_at: nu, updated_by: null }) })
  return Response.json({ ok: true, contentPlekken: nieuw })
}

/** Mailadres van de ingelogde klant (voor "toegevoegd door"). */
async function mailVan(token: string | null) {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', Authorization: `Bearer ${token}` } })
  return res.ok ? ((await res.json()) as { email?: string }).email : undefined
}
