// Frame.io in het klantportaal: video's van de deellink van de klant tonen en feedback plaatsen,
// via de Frame.io API (dus geen ingesloten Frame.io-venster, waar reageren door browsercookies faalt).
// Header x-supabase-token. Klant: eigen klant. Team: ?klant=<id>.
//   GET  ?actie=status            → { gekoppeld }
//   GET  ?actie=lijst             → { videos: [{ id, naam, thumb }] }
//   GET  ?actie=bestand&id=…      → { id, naam, src, fps, opmerkingen: [{ id, tekst, sec, wie, at }] }
//   POST { id, tekst, sec, naam } → { ok }
import { SITE, channel, sb, verifyAny, verifyUser } from '../lib/rise.mts'
import { NietGekoppeld, accountId, fio, gekoppeld, shareId } from '../lib/frameio.mts'

type Item = { id: string; type?: string; name?: string; media_type?: string; created_at?: string; media_links?: Record<string, Record<string, string> | null> }

async function wie(req: Request) {
  const token = req.headers.get('x-supabase-token')
  const klant = new URL(req.url).searchParams.get('klant')
  if (klant) { const me = await verifyUser(token); return me ? { clientId: klant, team: true, email: null as string | null } : null }
  const me = await verifyAny(token)
  return me?.client_id ? { clientId: me.client_id, team: false, email: me.email } : null
}

async function klant(clientId: string) {
  const [rij] = await sb<{ data: { name?: string; frameUrl?: string } }[]>(`clients?select=data&id=eq.${encodeURIComponent(clientId)}`)
  return rij?.data ?? {}
}

/** Korte f.io-link volgen naar de volledige deellink. */
async function volledig(url: string) {
  let u = new URL(url)
  for (let i = 0; i < 5 && u.hostname === 'f.io'; i++) {
    const res = await fetch(u, { redirect: 'manual' })
    const naar = res.headers.get('location')
    if (!naar) break
    u = new URL(naar, u)
  }
  return u.toString()
}

const thumb = (x: Item) => x.media_links?.thumbnail?.url ?? x.media_links?.thumbnail?.download_url ?? null
const isMedia = (x: Item) => x.type === 'file' && /^(video|image)\//.test(x.media_type ?? 'video/')

async function videos(acc: string, frameUrl?: string) {
  if (!frameUrl) return []
  const share = shareId(await volledig(frameUrl))
  if (!share) return []
  const inc = 'include=media_links.thumbnail&page_size=100'
  const top = (await fio<{ data: Item[] }>(`/accounts/${acc}/shares/${share}/assets?${inc}`)).data ?? []
  const uit: Item[] = []
  for (const x of top) {
    if (isMedia(x)) uit.push(x)
    else if (x.type === 'version_stack' || x.type === 'folder') {
      const pad = x.type === 'folder' ? 'folders' : 'version_stacks'
      const kids = (await fio<{ data: Item[] }>(`/accounts/${acc}/${pad}/${x.id}/children?${inc}`).catch(() => ({ data: [] as Item[] }))).data ?? []
      const media = kids.filter(isMedia).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      if (x.type === 'version_stack') { if (media[0]) uit.push({ ...media[0], name: x.name ?? media[0].name }) } else uit.push(...media)
    }
  }
  return uit.map((x) => ({ id: x.id, naam: x.name ?? 'Video', thumb: thumb(x) }))
}

/** Beeldsnelheid uit het bestand (veldnaam verschilt per versie), anders 25. */
function fpsVan(f: unknown): number {
  let fps = 0
  const zoek = (o: unknown) => {
    if (!o || typeof o !== 'object' || fps) return
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (/^(fps|frame_rate|framerate)$/i.test(k) && typeof v === 'number' && v > 0) { fps = v; return }
      if (v && typeof v === 'object') zoek(v)
    }
  }
  zoek(f)
  return fps || 25
}

export default async (req: Request) => {
  try {
    const q = new URL(req.url).searchParams
    if (q.get('actie') === 'status') return Response.json({ gekoppeld: await gekoppeld() })
    const ik = await wie(req)
    if (!ik) return new Response('Niet ingelogd', { status: 401 })
    const k = await klant(ik.clientId)
    const acc = await accountId()
    const lijst = await videos(acc, k.frameUrl)

    if (req.method === 'GET' && q.get('actie') === 'lijst') return Response.json({ videos: lijst })

    if (req.method === 'GET' && q.get('actie') === 'bestand') {
      const id = q.get('id') ?? ''
      if (!lijst.some((v) => v.id === id)) return new Response('Onbekende video', { status: 404 })
      let f: Item & Record<string, unknown> = { id }
      for (const inc of ['media_links.high_quality', 'media_links.efficient', 'media_links.original']) {
        try { f = (await fio<{ data: typeof f }>(`/accounts/${acc}/files/${id}?include=${inc}`)).data; const l = f.media_links ?? {}; if (Object.values(l).some((x) => x && (x.inline_url || x.download_url || x.url))) break } catch { /* volgende */ }
      }
      const l = f.media_links ?? {}
      const src = l.high_quality?.inline_url ?? l.high_quality?.download_url ?? l.efficient?.inline_url ?? l.efficient?.download_url ?? l.original?.inline_url ?? null
      const fps = fpsVan(f)
      const c = await fio<{ data: { id: string; text?: string; timestamp?: number | string | null; created_at?: string; owner?: { name?: string } }[] }>(`/accounts/${acc}/files/${id}/comments?page_size=100`).catch(() => ({ data: [] }))
      const opmerkingen = (c.data ?? []).map((x) => ({
        id: x.id, tekst: x.text ?? '', wie: x.owner?.name ?? '', at: x.created_at ?? '',
        sec: typeof x.timestamp === 'number' ? x.timestamp / fps : null,
      })).sort((a, b) => (a.sec ?? 1e9) - (b.sec ?? 1e9))
      return Response.json({ id, naam: f.name ?? lijst.find((v) => v.id === id)?.naam, src, fps, opmerkingen })
    }

    if (req.method === 'POST') {
      const b = await req.json() as { id?: string; tekst?: string; sec?: number; naam?: string }
      const tekst = (b.tekst ?? '').trim().slice(0, 2000)
      if (!b.id || !tekst) return new Response('Lege opmerking', { status: 400 })
      if (!lijst.some((v) => v.id === b.id)) return new Response('Onbekende video', { status: 404 })
      const f = (await fio<{ data: unknown }>(`/accounts/${acc}/files/${b.id}`)).data
      const fps = fpsVan(f)
      const naam = (b.naam ?? '').trim().slice(0, 60) || ik.email || (ik.team ? 'Rise' : 'Klant')
      const data: Record<string, unknown> = { text: `${naam}${k.name && !ik.team ? ` (${k.name})` : ''}: ${tekst}` }
      if (typeof b.sec === 'number' && b.sec >= 0) data.timestamp = Math.round(b.sec * fps)
      await fio(`/accounts/${acc}/files/${b.id}/comments`, { method: 'POST', body: JSON.stringify({ data }) })
      if (!ik.team) {
        const video = lijst.find((v) => v.id === b.id)?.naam ?? 'video'
        const m = typeof b.sec === 'number' ? `${Math.floor(b.sec / 60)}:${String(Math.floor(b.sec % 60)).padStart(2, '0')}` : ''
        await channel(`:speech_balloon: *Feedback van ${naam}* (${k.name ?? 'klant'}) op _${video}_${m ? ` bij ${m}` : ''}\n> ${tekst.replace(/\n/g, '\n> ')}\n<${SITE}/#/klanten/${ik.clientId}|Open het klantdossier>`).catch(() => null)
      }
      return Response.json({ ok: true })
    }
    return new Response('Onbekende actie', { status: 400 })
  } catch (e) {
    if (e instanceof NietGekoppeld) return Response.json({ gekoppeld: false }, { status: 503 })
    console.error(e)
    return new Response(e instanceof Error ? e.message : 'Fout', { status: 500 })
  }
}
