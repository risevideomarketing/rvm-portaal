// Eigen instellingen opslaan (elk teamlid voor zichzelf). POST { meldingen: { deadline?, stil?, tag?, opvolgen? } }
import { sb, verifyUser } from '../lib/rise.mts'

const SOORTEN = ['deadline', 'stil', 'tag', 'opvolgen']

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Alleen POST', { status: 405 })
  const me = await verifyUser(req.headers.get('x-supabase-token'))
  if (!me) return new Response('Niet ingelogd', { status: 401 })
  const { meldingen } = ((await req.json().catch(() => ({}))) ?? {}) as { meldingen?: Record<string, unknown> }
  const schoon = Object.fromEntries(SOORTEN.filter((k) => typeof meldingen?.[k] === 'boolean').map((k) => [k, meldingen![k]]))
  await sb(`allowed_users?person=eq.${encodeURIComponent(me.person)}`, { method: 'PATCH', body: JSON.stringify({ meldingen: schoon }) })
  return Response.json({ ok: true, meldingen: schoon })
}
