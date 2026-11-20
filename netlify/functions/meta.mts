// Meta-cijfers voor het dashboard en het klantportaal.
//   GET  ?clientId=umcu   → laatste weekoverzicht van die klant (team, of de klant zelf)
//   GET  ?alle=1          → laatste weekoverzicht van elke klant (team)
//   GET  ?eigen=1&periode=7d → live cijfers van de eigen Rise-advertenties (team; RISE_META_AD_ACCOUNT)
//   GET  ?clientId=umcu&live=1&periode=7d → live cijfers van een klant (team, statistieken), een uur bewaard
//   POST { clientId }     → weekoverzicht nu maken (admin), bijv. direct na het koppelen van een account
// Weekoverzichten maakt meta-weekly elke maandag om 07:00 en staan in de tabel meta_weekly.
import { insights, maakWeekoverzicht, metaGekoppeld, type Weekoverzicht } from '../lib/meta.mts'
import { sb, verifyAny } from '../lib/rise.mts'

const PRESETS: Record<string, string> = { '7d': 'last_7d', '30d': 'last_30d', maand: 'this_month', vorigeMaand: 'last_month' }
const BEWAREN_MS = 60 * 60 * 1000

/** Uitgaven weghalen als de klant ze niet mag zien (instelling per klant). */
function voorKlant(w: Weekoverzicht): Weekoverzicht {
  const kaal = (c: Weekoverzicht['week']) => ({ ...c, spend: -1, kostenPerLead: null, kostenPerAankoop: null })
  return { ...w, week: kaal(w.week), vorige: kaal(w.vorige), totaal: kaal(w.totaal) }
}

export default async (req: Request) => {
  const me = await verifyAny(req.headers.get('x-supabase-token'))
  if (!me) return new Response('Niet ingelogd', { status: 401 })
  const team = ['admin', 'medewerker', 'sales'].includes(me.role)
  const url = new URL(req.url)

  if (req.method === 'POST') {
    if (me.role !== 'admin') return new Response('Alleen admins', { status: 403 })
    if (!metaGekoppeld()) return new Response('META_ACCESS_TOKEN staat nog niet in Netlify', { status: 400 })
    const { clientId } = (await req.json().catch(() => ({}))) as { clientId?: string }
    const [row] = await sb<{ data: { metaAdAccount?: string } }[]>(`clients?select=data&id=eq.${encodeURIComponent(clientId ?? '')}`)
    const account = row?.data.metaAdAccount?.trim()
    if (!account) return new Response('Geen advertentieaccount ingesteld bij deze klant', { status: 400 })
    try {
      return Response.json({ gekoppeld: true, overzicht: await maakWeekoverzicht(clientId!, account) })
    } catch (e) {
      return new Response((e as Error).message, { status: 502 })
    }
  }

  // Live: eigen advertenties van Rise, of een klant in de statistieken (alleen team), een uur bewaard
  if (url.searchParams.get('eigen') || url.searchParams.get('live')) {
    if (!team) return new Response('Geen toegang', { status: 403 })
    let account = process.env.RISE_META_AD_ACCOUNT
    if (url.searchParams.get('live')) {
      const [row] = await sb<{ data: { metaAdAccount?: string } }[]>(`clients?select=data&id=eq.${encodeURIComponent(url.searchParams.get('clientId') ?? '')}`)
      account = row?.data.metaAdAccount?.trim()
    }
    if (!account || !metaGekoppeld()) return Response.json({ gekoppeld: false })
    const periode = url.searchParams.get('periode') ?? '7d'
    if (!PRESETS[periode]) return new Response('Onbekende periode', { status: 400 })
    const key = `${account}:${periode}`
    const [cache] = await sb<{ data: unknown; at: string }[]>(`meta_cache?select=data,at&key=eq.${encodeURIComponent(key)}`)
    if (cache && Date.now() - new Date(cache.at).getTime() < BEWAREN_MS) return Response.json({ gekoppeld: true, bijgewerkt: cache.at, cijfers: cache.data })
    try {
      const cijfers = await insights(account, { preset: PRESETS[periode] })
      const at = new Date().toISOString()
      await sb('meta_cache', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key, data: cijfers, at }) })
      return Response.json({ gekoppeld: true, bijgewerkt: at, cijfers })
    } catch (e) {
      return new Response((e as Error).message, { status: 502 })
    }
  }

  // Laatste weekoverzicht van alle klanten (statistieken van het team)
  if (url.searchParams.get('alle')) {
    if (!team) return new Response('Geen toegang', { status: 403 })
    const rows = await sb<{ client_id: string; data: Weekoverzicht }[]>('meta_weekly?select=client_id,data&order=week_start.desc&limit=500')
    const laatste: Record<string, Weekoverzicht> = {}
    for (const r of rows) laatste[r.client_id] ??= r.data
    return Response.json({ overzichten: laatste })
  }

  // Eén klant
  const clientId = url.searchParams.get('clientId') ?? ''
  if (!team && !(me.role === 'client' && me.client_id === clientId)) return new Response('Geen toegang', { status: 403 })
  const [[client], [rij]] = await Promise.all([
    sb<{ data: { metaUitgavenTonen?: boolean } }[]>(`clients?select=data&id=eq.${encodeURIComponent(clientId)}`),
    sb<{ data: Weekoverzicht }[]>(`meta_weekly?select=data&client_id=eq.${encodeURIComponent(clientId)}&order=week_start.desc&limit=1`),
  ])
  if (!rij) return Response.json({ overzicht: null })
  const uitgavenTonen = team || client?.data.metaUitgavenTonen !== false
  return Response.json({ overzicht: uitgavenTonen ? rij.data : voorKlant(rij.data) })
}
