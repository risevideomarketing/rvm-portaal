// Netlify roept deze functie automatisch aan na elke geslaagde deploy (event-triggered function).
// Bij een nieuwe live-versie (productie) een bericht in #rise-videomarketing.
import { SITE, channel } from '../lib/rise.mts'

interface DeployPayload {
  payload?: { context?: string; branch?: string; title?: string; commit_ref?: string; committer?: string }
}

export default async (req: Request) => {
  const { payload: p } = (await req.json()) as DeployPayload
  if (!p || p.context !== 'production') return new Response('Geen productie', { status: 200 })
  const sha = (p.commit_ref ?? '').slice(0, 7)
  const titel = (p.title ?? 'Nieuwe versie').split('\n')[0]
  try {
    await channel(`:rocket: Nieuw live op <${SITE}|het dashboard>: *${titel}* (\`${sha}\`)`)
  } catch (e) {
    console.error('Slack-bericht na deploy mislukt', e)
  }
  return new Response('ok')
}
