// De klant zet een taak in zijn portaal op "gedaan" (of weer open). POST { taakId, gedaan } met header X-Supabase-Token.
// Klanten mogen hun klantrij alleen lezen; deze functie past alleen het vinkje van een eigen taak aan.
import { sb, verifyAny } from '../lib/rise.mts'

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Alleen POST', { status: 405 })
  const me = await verifyAny(req.headers.get('x-supabase-token'))
  if (!me?.client_id) return new Response('Alleen voor klanten', { status: 401 })
  const { taakId, gedaan } = ((await req.json().catch(() => ({}))) ?? {}) as { taakId?: string; gedaan?: boolean }
  if (!taakId) return new Response('Taak ontbreekt', { status: 400 })

  const [rij] = await sb<{ data: { klantTaken?: { id: string; done: boolean; doneAt?: string }[] } }[]>(`clients?select=data&id=eq.${encodeURIComponent(me.client_id)}`)
  const taken = rij?.data.klantTaken ?? []
  if (!taken.some((t) => t.id === taakId)) return new Response('Taak niet gevonden', { status: 404 })
  const nu = new Date().toISOString()
  const klantTaken = taken.map((t) => (t.id === taakId ? { ...t, done: !!gedaan, doneAt: gedaan ? nu : undefined } : t))
  await sb(`clients?id=eq.${encodeURIComponent(me.client_id)}`, { method: 'PATCH', body: JSON.stringify({ data: { ...rij.data, klantTaken }, updated_at: nu, updated_by: null }) /* updated_by leeg: anders negeert het dashboard van die gebruiker de live-wijziging */ })
  return Response.json({ ok: true, klantTaken })
}
