// Statusbalk (alleen het team): of alle koppelingen echt werken.
import { koppelingen } from '../lib/status.mts'
import { verifyUser } from '../lib/rise.mts'

export default async (req: Request) => {
  if (!(await verifyUser(req.headers.get('x-supabase-token')))) return new Response('Alleen het team', { status: 401 })
  return Response.json({ checks: await koppelingen(), tijd: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
