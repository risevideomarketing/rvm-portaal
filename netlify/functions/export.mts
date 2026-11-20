// Volledige kopie downloaden vanaf Instellingen (alleen beheerders). GET → JSON, zelfde opbouw als de nachtelijke back-up.
import { maakBackup } from '../lib/backup.mts'
import { verifyUser } from '../lib/rise.mts'

export default async (req: Request) => {
  const me = await verifyUser(req.headers.get('x-supabase-token'))
  if (!me || me.role !== 'admin') return new Response('Alleen beheerders', { status: 401 })
  return Response.json(await maakBackup())
}
