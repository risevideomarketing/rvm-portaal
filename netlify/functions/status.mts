// Statusbalk (alleen het team): controleert per koppeling of hij echt werkt, niet alleen of er een sleutel staat.
import { googleGekoppeld, googleToken } from '../lib/google.mts'
import { mailGekoppeld } from '../lib/mail.mts'
import { metaGekoppeld } from '../lib/meta.mts'
import { mb, moneybirdGekoppeld } from '../lib/moneybird.mts'
import { sb, verifyUser } from '../lib/rise.mts'

type Check = { naam: string; ok: boolean; uitleg: string }

const metTijd = <T,>(p: Promise<T>, ms = 8000) => Promise.race([p, new Promise<T>((_, f) => setTimeout(() => f(new Error('geen antwoord')), ms))])

async function test(naam: string, gekoppeld: boolean, fn: () => Promise<void>): Promise<Check> {
  if (!gekoppeld) return { naam, ok: false, uitleg: 'Nog niet gekoppeld' }
  try { await metTijd(fn()); return { naam, ok: true, uitleg: 'Werkt' } } catch (e) { return { naam, ok: false, uitleg: (e as Error).message.slice(0, 160) } }
}

export default async (req: Request) => {
  if (!(await verifyUser(req.headers.get('x-supabase-token')))) return new Response('Alleen het team', { status: 401 })
  const checks = await Promise.all([
    test('Database', true, async () => { await sb('clients?select=id&limit=1') }),
    test('Slack', Boolean(process.env.SLACK_BOT_TOKEN), async () => {
      const j = (await (await fetch('https://slack.com/api/auth.test', { method: 'POST', headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN!.trim()}` } })).json()) as { ok: boolean; error?: string }
      if (!j.ok) throw new Error(`Slack: ${j.error}`)
    }),
    test('Moneybird', moneybirdGekoppeld(), async () => { await mb('contacts.json?per_page=1') }),
    test('Google Agenda', googleGekoppeld(), async () => {
      const token = await googleToken('https://www.googleapis.com/auth/calendar')
      const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) throw new Error(`Google ${r.status}`)
    }),
    test('Mail', mailGekoppeld(), async () => {}),
    test('Meta', metaGekoppeld(), async () => {
      const r = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(process.env.META_ACCESS_TOKEN!.trim())}`)
      if (!r.ok) throw new Error(`Meta ${r.status}`)
    }),
  ])
  return Response.json({ checks, tijd: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
