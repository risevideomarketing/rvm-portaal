// Directe meldingen vanuit het dashboard (alleen voor ingelogde teamleden):
// - { kind: 'tag', taskId, text }       → DM aan iedereen die met @Naam getagd is
// - { kind: 'feedback', taskId, step }  → bericht in #rise-videomarketing: feedback gevraagd
// - { kind: 'test' }                    → testbericht naar jezelf
import { channel, dm, sb, taskLink, team, verifyUser, type TaskRow } from '../lib/rise.mts'

const NAMES: Record<string, string> = { lars: 'Lars', daan: 'Daan', joost: 'Joost' }

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Alleen POST', { status: 405 })
  const me = await verifyUser(req.headers.get('x-supabase-token'))
  if (!me) return new Response('Geen toegang', { status: 401 })

  const body = (await req.json()) as { kind: string; taskId?: string; text?: string; step?: string }
  const emails = await team()

  if (body.kind === 'test') {
    await dm(me.person, ':wave: Testbericht van het Rise-dashboard. De Slack-koppeling werkt.', emails)
    return Response.json({ ok: true })
  }

  const [row] = body.taskId ? await sb<{ data: TaskRow }[]>(`tasks?select=data&id=eq.${encodeURIComponent(body.taskId)}`) : []
  if (!row) return new Response('Taak niet gevonden', { status: 404 })
  const t = row.data

  if (body.kind === 'tag' && body.text) {
    const tagged = Object.keys(NAMES).filter((p) => p !== me.person && new RegExp(`@${NAMES[p]}(?![a-z])`, 'i').test(body.text!))
    for (const p of tagged) {
      await dm(p, `:speech_balloon: ${NAMES[me.person]} tagde je bij *${taskLink(t)}*:\n> ${body.text.slice(0, 500)}`, emails, 'tag')
    }
    return Response.json({ ok: true, sent: tagged })
  }

  if (body.kind === 'feedback') {
    await channel(`:eyes: ${NAMES[me.person]} vraagt feedback op *${taskLink(t)}*${body.step ? ` (${body.step})` : ''}.`)
    return Response.json({ ok: true })
  }

  return new Response('Onbekend soort melding', { status: 400 })
}
