// Eén mailadres kan bij meerdere klanten horen (bijv. iemand die voor drie organisaties werkt).
// GET: de klanten waar dit adres toegang toe heeft (client.logins). POST { clientId }: wissel van portaal.
// Het actieve portaal staat in allowed_users en profiles (client_id); daarop draait alle beveiliging.
import { env, sb } from '../lib/rise.mts'

export default async (req: Request) => {
  const token = req.headers.get('x-supabase-token')
  if (!token) return new Response('Niet ingelogd', { status: 401 })
  const u = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${token}` } })
  if (!u.ok) return new Response('Niet ingelogd', { status: 401 })
  const user = (await u.json()) as { id: string; email?: string }
  const email = (user.email ?? '').toLowerCase()
  const [profiel] = await sb<{ role: string; client_id: string | null }[]>(`profiles?select=role,client_id&user_id=eq.${user.id}`)
  if (!email || profiel?.role !== 'client') return Response.json({ klanten: [] })

  const rijen = await sb<{ id: string; data: { name: string; logins?: string[] } }[]>(`clients?select=id,data&data->logins=cs.${encodeURIComponent(JSON.stringify([email]))}`)
  const klanten = rijen.map((r) => ({ id: r.id, naam: r.data.name }))
  if (profiel.client_id && !klanten.some((k) => k.id === profiel.client_id)) {
    const [eigen] = await sb<{ id: string; data: { name: string } }[]>(`clients?select=id,data&id=eq.${encodeURIComponent(profiel.client_id)}`)
    if (eigen) klanten.unshift({ id: eigen.id, naam: eigen.data.name })
  }

  if (req.method === 'POST') {
    const { clientId } = ((await req.json().catch(() => ({}))) ?? {}) as { clientId?: string }
    if (!clientId || !klanten.some((k) => k.id === clientId)) return new Response('Geen toegang tot deze klant', { status: 403 })
    await sb(`allowed_users?email=eq.${encodeURIComponent(email)}`, { method: 'PATCH', body: JSON.stringify({ client_id: clientId }) })
    await sb(`profiles?user_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ client_id: clientId }) })
    return Response.json({ ok: true })
  }
  return Response.json({ actief: profiel.client_id, klanten: klanten.sort((a, b) => a.naam.localeCompare(b.naam, 'nl')) })
}
