// MCP-server: Claude beheert de app rechtstreeks (zonder browser). Toevoegen in Claude → Instellingen → Connectors → eigen connector:
//   https://app.risevideomarketing.nl/mcp/<RISE_MCP_KEY>
// RISE_MCP_KEY zet Daan zelf in Netlify (lang, willekeurig, geheim). Zonder die sleutel in het pad: geen toegang.
// Spreekt het MCP-protocol (JSON-RPC over HTTP, zonder sessie). Schrijft met de service role, dus net als een beheerder.
import { timingSafeEqual } from 'node:crypto'
import { sb } from '../lib/rise.mts'

const TABELLEN = ['tasks', 'contacts', 'clients', 'projects', 'kennisbank', 'opdrachten'] as const
type Tabel = (typeof TABELLEN)[number]
const OMSCHRIJVING: Record<Tabel, string> = {
  tasks: 'taken (title, deadline YYYY-MM-DD "af vóór", assignee daan/lars/joost, status todo/bezig/klaar, priority hoog/middel/laag, soort, clientId, contactId, projectId)',
  contacts: 'CRM-contacten (company, name, email, phone, stage koud/gemaild/lead/voorstel/klant/extra/afgehandeld, value, deals[], timeline[])',
  clients: 'klanten met portaal (name, phase, pakket, producties, planning, klantTaken, strippenkaart, links, hulpvragen)',
  projects: 'producties en interne projecten (name, soort productie/intern, fase, clientId, deadline, updates[], notities)',
  kennisbank: 'kennisbank-artikelen (title, category, groep, summary, body[], steps[], notion = Notion-markdown, klant = ook in het portaal)',
  opdrachten: 'gevonden opdrachten (title, source, url, budget, status open/bewaard/weg/lead, relevance)',
}

const TOOLS = [
  {
    name: 'lijst',
    description: 'Rijen uit een tabel van het Rise-dashboard. Optioneel zoeken in de tekst. Tabellen: ' + TABELLEN.map((t) => `${t}: ${OMSCHRIJVING[t]}`).join('; '),
    inputSchema: { type: 'object', properties: { tabel: { type: 'string', enum: TABELLEN }, zoek: { type: 'string', description: 'Woord of zin (hoofdletterongevoelig)' }, max: { type: 'number', description: 'Maximaal aantal rijen (standaard 50)' } }, required: ['tabel'] },
  },
  { name: 'lees', description: 'Eén rij volledig, op id.', inputSchema: { type: 'object', properties: { tabel: { type: 'string', enum: TABELLEN }, id: { type: 'string' } }, required: ['tabel', 'id'] } },
  {
    name: 'opslaan',
    description: 'Rij aanmaken of bijwerken. Bestaat de id al, dan worden alleen de meegegeven velden aangepast (samenvoegen). Nieuwe taak: geef id, title, deadline, assignee, status, priority, soort, comments: [].',
    inputSchema: { type: 'object', properties: { tabel: { type: 'string', enum: TABELLEN }, id: { type: 'string' }, data: { type: 'object', description: 'Velden om te zetten' }, vervangen: { type: 'boolean', description: 'true = hele rij vervangen in plaats van samenvoegen' } }, required: ['tabel', 'id', 'data'] },
  },
  { name: 'verwijder', description: 'Rij verwijderen. Alleen gebruiken als Daan daarom vraagt.', inputSchema: { type: 'object', properties: { tabel: { type: 'string', enum: TABELLEN }, id: { type: 'string' } }, required: ['tabel', 'id'] } },
  { name: 'overzicht', description: 'Snel overzicht: open taken per persoon, deadlines deze week, deals per fase, klanten.', inputSchema: { type: 'object', properties: {} } },
]

const geldig = (t: unknown): t is Tabel => TABELLEN.includes(t as Tabel)
const enc = encodeURIComponent

async function voerUit(naam: string, a: Record<string, any>): Promise<unknown> {
  if (naam === 'overzicht') {
    const [taken, contacten, klanten] = await Promise.all([
      sb<{ data: any }[]>('tasks?select=data'), sb<{ data: any }[]>('contacts?select=data'), sb<{ data: any }[]>('clients?select=data'),
    ])
    const open = taken.map((r) => r.data).filter((t) => t.status !== 'klaar')
    const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const fasen: Record<string, number> = {}
    for (const c of contacten.map((r) => r.data)) for (const d of c.deals?.length ? c.deals : [c]) fasen[d.stage] = (fasen[d.stage] ?? 0) + 1
    return {
      openTaken: Object.fromEntries(['daan', 'lars', 'joost'].map((p) => [p, open.filter((t) => t.assignee === p).length])),
      dezeWeek: open.filter((t) => t.deadline && t.deadline <= week).map((t) => ({ id: t.id, title: t.title, deadline: t.deadline, assignee: t.assignee })),
      dealsPerFase: fasen,
      klanten: klanten.map((r) => ({ id: r.data.id, name: r.data.name, pakket: r.data.pakket })),
    }
  }
  if (!geldig(a.tabel)) throw new Error(`Onbekende tabel. Kies uit: ${TABELLEN.join(', ')}`)
  const t = a.tabel as Tabel
  if (naam === 'lijst') {
    const rijen = await sb<{ id: string; data: any; updated_at: string }[]>(`${t}?select=id,data,updated_at&order=updated_at.desc&limit=1000`)
    const q = String(a.zoek ?? '').toLowerCase()
    const max = Math.min(Number(a.max) || 50, 200)
    return rijen.filter((r) => !q || JSON.stringify(r.data).toLowerCase().includes(q)).slice(0, max).map((r) => {
      // Lange velden inkorten in de lijst; met "lees" krijg je alles
      const kort = Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, typeof v === 'string' && v.length > 300 ? `${v.slice(0, 300)}…` : Array.isArray(v) && v.length > 10 ? `[${v.length} items]` : v]))
      return { id: r.id, ...kort, updated_at: r.updated_at }
    })
  }
  const id = String(a.id ?? '').trim()
  if (!id) throw new Error('id ontbreekt')
  if (naam === 'lees') {
    const [r] = await sb<{ data: unknown }[]>(`${t}?select=data&id=eq.${enc(id)}`)
    if (!r) throw new Error('Niet gevonden')
    return r.data
  }
  if (naam === 'opslaan') {
    const [oud] = await sb<{ data: Record<string, unknown> }[]>(`${t}?select=data&id=eq.${enc(id)}`)
    const data = { ...(a.vervangen ? {} : oud?.data ?? {}), ...(a.data ?? {}), id }
    const nu = new Date().toISOString()
    if (t === 'tasks') (data as any).updatedAt = nu
    await sb(t, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id, data, updated_at: nu }) })
    return { ok: true, nieuw: !oud, data }
  }
  if (naam === 'verwijder') {
    await sb(`${t}?id=eq.${enc(id)}`, { method: 'DELETE' })
    return { ok: true }
  }
  throw new Error(`Onbekende tool: ${naam}`)
}

const gelijk = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export default async (req: Request) => {
  const sleutel = process.env.RISE_MCP_KEY?.trim()
  const pad = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? ''
  if (!sleutel || sleutel.length < 24 || !gelijk(pad, sleutel)) return new Response('Niet gevonden', { status: 404 })
  if (req.method === 'GET') return new Response('Rise MCP-server. Gebruik POST (JSON-RPC).', { status: 405, headers: { Allow: 'POST' } })
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  const bericht = (await req.json().catch(() => null)) as { id?: unknown; method?: string; params?: any } | { id?: unknown; method?: string; params?: any }[] | null
  if (!bericht) return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Ongeldige JSON' } }, { status: 400 })
  const lijst = Array.isArray(bericht) ? bericht : [bericht]
  const antwoorden = []
  for (const m of lijst) {
    if (m.id === undefined) continue // notificaties (bijv. notifications/initialized) krijgen geen antwoord
    try {
      let result: unknown
      if (m.method === 'initialize') result = { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'rise-video-marketing', version: '1.0.0' }, instructions: 'Het Rise Video Marketing-dashboard (app.risevideomarketing.nl): taken, CRM, klanten, producties, kennisbank en opdrachten. Teksten in het Nederlands, kort, geen gedachtestreepjes.' }
      else if (m.method === 'ping') result = {}
      else if (m.method === 'tools/list') result = { tools: TOOLS }
      else if (m.method === 'tools/call') {
        try {
          const uit = await voerUit(String(m.params?.name), (m.params?.arguments ?? {}) as Record<string, any>)
          result = { content: [{ type: 'text', text: JSON.stringify(uit, null, 1) }] }
        } catch (e) {
          result = { content: [{ type: 'text', text: (e as Error).message }], isError: true }
        }
      } else throw Object.assign(new Error(`Onbekende methode ${m.method}`), { code: -32601 })
      antwoorden.push({ jsonrpc: '2.0', id: m.id, result })
    } catch (e) {
      antwoorden.push({ jsonrpc: '2.0', id: m.id, error: { code: (e as { code?: number }).code ?? -32603, message: (e as Error).message } })
    }
  }
  if (!antwoorden.length) return new Response(null, { status: 202 })
  return Response.json(Array.isArray(bericht) ? antwoorden : antwoorden[0])
}

export const config = { path: '/mcp/*' }
