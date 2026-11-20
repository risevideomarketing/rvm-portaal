// GitHub-webhook: bij elke push naar een branch (niet main, niet lars/*) een bericht in #rise-videomarketing.
// Instellen in GitHub → Settings → Webhooks: Payload URL .../.netlify/functions/github-push,
// content type application/json, alleen het "push"-event, Secret = GITHUB_WEBHOOK_SECRET (ook in Netlify).
import { createHmac, timingSafeEqual } from 'node:crypto'
import { channel } from '../lib/rise.mts'

const NAMES: Record<string, string> = { risevideomarketing: 'Daan', Larsvandermeer13: 'Lars' }

function validSignature(body: string, header: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret || !header?.startsWith('sha256=')) return false
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`)
  const given = Buffer.from(header)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

interface PushEvent {
  ref?: string
  deleted?: boolean
  sender?: { login?: string }
  pusher?: { name?: string }
  commits?: { message: string }[]
  head_commit?: { message?: string } | null
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Alleen POST', { status: 405 })
  const body = await req.text()
  if (!validSignature(body, req.headers.get('x-hub-signature-256'))) return new Response('Ongeldige handtekening', { status: 401 })

  const event = req.headers.get('x-github-event')
  if (event === 'ping') return new Response('pong')
  if (event !== 'push') return new Response('Genegeerd')

  const p = JSON.parse(body) as PushEvent
  const branch = (p.ref ?? '').replace(/^refs\/heads\//, '')
  if (!branch || p.deleted || branch === 'main' || branch.startsWith('lars/')) return new Response('Genegeerd')

  const login = p.sender?.login ?? p.pusher?.name ?? 'Iemand'
  const wie = NAMES[login] ?? login
  const n = p.commits?.length ?? 0
  const titel = (p.head_commit?.message ?? '').split('\n')[0] || 'nieuwe wijziging'
  await channel(
    `:inbox_tray: ${wie} heeft gepusht naar \`${branch}\`: *${titel}*${n > 1 ? ` (${n} commits)` : ''}. Gaat binnen het uur live na controle.`,
  )
  return new Response('ok')
}
