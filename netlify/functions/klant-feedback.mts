// Feedback op video's vanuit het portaal (naast het ingesloten Frame.io-venster, waar reageren niet werkt).
// Header x-supabase-token. Klant: eigen klant. Team: ?klant=<id>.
//   GET                          → { feedback: [{ id, at, naam, tijd, tekst, klaar }] }
//   POST { tekst, tijd, naam }   → { ok, feedback }      (klant of team)
//   PATCH { id, klaar }          → { ok, feedback }      (alleen team: afvinken)
import { SITE, channel, sb, verifyAny, verifyUser } from '../lib/rise.mts'

type Fb = { id: string; at: string; naam: string; email?: string | null; tijd?: string; tekst: string; klaar?: boolean }

async function wie(req: Request) {
  const token = req.headers.get('x-supabase-token')
  const klant = new URL(req.url).searchParams.get('klant')
  if (klant) { const me = await verifyUser(token); return me ? { clientId: klant, team: true, email: null as string | null } : null }
  const me = await verifyAny(token)
  return me?.client_id ? { clientId: me.client_id, team: false, email: me.email } : null
}

export default async (req: Request) => {
  const ik = await wie(req)
  if (!ik) return new Response('Niet ingelogd', { status: 401 })
  const [rij] = await sb<{ data: { name?: string; videoFeedback?: Fb[] } }[]>(`clients?select=data&id=eq.${encodeURIComponent(ik.clientId)}`)
  if (!rij) return new Response('Onbekende klant', { status: 404 })
  const lijst = rij.data.videoFeedback ?? []
  const zichtbaar = (l: Fb[]) => l.map(({ email: _e, ...x }) => x)
  if (req.method === 'GET') return Response.json({ feedback: zichtbaar(lijst) })

  const b = await req.json().catch(() => ({})) as { tekst?: string; tijd?: string; naam?: string; id?: string; klaar?: boolean }
  let nieuw = lijst
  if (req.method === 'POST') {
    const tekst = (b.tekst ?? '').trim().slice(0, 2000)
    if (!tekst) return new Response('Lege opmerking', { status: 400 })
    const tijd = (b.tijd ?? '').trim().slice(0, 12)
    const naam = (b.naam ?? '').trim().slice(0, 60) || ik.email || (ik.team ? 'Rise' : 'Klant')
    nieuw = [...lijst, { id: crypto.randomUUID(), at: new Date().toISOString(), naam, email: ik.email, tijd, tekst }]
    if (!ik.team) {
      await channel(`:speech_balloon: *Video-feedback van ${naam}* (${rij.data.name ?? 'klant'})${tijd ? ` bij ${tijd}` : ''}\n> ${tekst.replace(/\n/g, '\n> ')}\n<${SITE}/#/klanten/${ik.clientId}|Open het klantdossier>`).catch(() => null)
    }
  } else if (req.method === 'PATCH') {
    if (!ik.team) return new Response('Alleen voor het team', { status: 403 })
    nieuw = lijst.map((x) => (x.id === b.id ? { ...x, klaar: Boolean(b.klaar) } : x))
  } else return new Response('Onbekende actie', { status: 405 })

  await sb(`clients?id=eq.${encodeURIComponent(ik.clientId)}`, { method: 'PATCH', body: JSON.stringify({ data: { ...rij.data, videoFeedback: nieuw }, updated_at: new Date().toISOString(), updated_by: null }) })
  return Response.json({ ok: true, feedback: zichtbaar(nieuw) })
}
