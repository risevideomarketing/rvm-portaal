// Controleert per koppeling of hij echt werkt (gedeeld door de statusbalk en de Claude-koppeling).
import { googleGekoppeld, googleToken } from './google.mts'
import { mailGekoppeld } from './mail.mts'
import { metaGekoppeld } from './meta.mts'
import { mb, moneybirdGekoppeld } from './moneybird.mts'
import { sb } from './rise.mts'

export type Check = { naam: string; ok: boolean; uitleg: string }

const metTijd = <T,>(p: Promise<T>, ms = 8000) => Promise.race([p, new Promise<T>((_, f) => setTimeout(() => f(new Error('geen antwoord')), ms))])

async function test(naam: string, gekoppeld: boolean, fn: () => Promise<void>): Promise<Check> {
  if (!gekoppeld) return { naam, ok: false, uitleg: 'Nog niet gekoppeld' }
  try { await metTijd(fn()); return { naam, ok: true, uitleg: 'Werkt' } } catch (e) { return { naam, ok: false, uitleg: (e as Error).message.slice(0, 160) } }
}

/** Alle checks. Meta is optioneel: niet ingesteld is geen fout. */
export async function koppelingen(): Promise<Check[]> {
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
    test('Google Analytics', googleGekoppeld() && Boolean(process.env.GA4_PROPERTY_ID), async () => {
      const token = await googleToken('https://www.googleapis.com/auth/analytics.readonly')
      const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${(process.env.GA4_PROPERTY_ID ?? '').replace(/\D/g, '')}:runReport`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], metrics: [{ name: 'activeUsers' }] }) })
      if (!r.ok) throw new Error(`Analytics ${r.status}: ${(await r.text()).slice(0, 140)}`)
    }),
    test('Meta', metaGekoppeld(), async () => {
      const r = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(process.env.META_ACCESS_TOKEN!.trim())}`)
      if (!r.ok) throw new Error(`Meta ${r.status}`)
    }),
  ])
  return checks.filter((c) => !(c.naam === 'Meta' && c.uitleg === 'Nog niet gekoppeld'))
}
