// Hulpvraag van een klant vanuit het portaal. POST { tekst } met header X-Supabase-Token.
// Komt binnen in het Slack-kanaal (met klant, mailadres en link naar het dossier) en staat bij de klant in het dossier.
import { SITE, channel, env, sb, verifyAny } from '../lib/rise.mts'

interface Hulpvraag { id: string; tekst: string; email?: string; at: string; afgehandeld?: boolean; afgehandeldAt?: string }

const MAX_PER_DAG = 10

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Alleen POST', { status: 405 })
  const token = req.headers.get('x-supabase-token')
  const me = await verifyAny(token)
  if (!me?.client_id) return new Response('Alleen voor klanten', { status: 401 })
  const { tekst: ruw } = ((await req.json().catch(() => ({}))) ?? {}) as { tekst?: string }
  const tekst = (ruw ?? '').trim()
  if (tekst.length < 3) return new Response('Je vraag is nog leeg', { status: 400 })
  if (tekst.length > 2000) return new Response('Je vraag is te lang (max. 2000 tekens)', { status: 400 })

  const [rij] = await sb<{ data: { name?: string; hulpvragen?: Hulpvraag[] } }[]>(`clients?select=data&id=eq.${encodeURIComponent(me.client_id)}`)
  if (!rij) return new Response('Klant niet gevonden', { status: 404 })
  const vragen = rij.data.hulpvragen ?? []
  const dagGeleden = Date.now() - 86_400_000
  if (vragen.filter((v) => new Date(v.at).getTime() > dagGeleden).length >= MAX_PER_DAG) {
    return new Response('Je hebt vandaag al veel vragen gestuurd. Mail ons gerust op hello@risevideomarketing.nl.', { status: 429 })
  }

  const gebruiker = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${token}` } })
  const email = gebruiker.ok ? ((await gebruiker.json()) as { email?: string }).email : undefined
  const nu = new Date().toISOString()
  const vraag: Hulpvraag = { id: crypto.randomUUID().slice(0, 8), tekst, email, at: nu }
  const hulpvragen = [vraag, ...vragen]
  await sb(`clients?id=eq.${encodeURIComponent(me.client_id)}`, { method: 'PATCH', body: JSON.stringify({ data: { ...rij.data, hulpvragen }, updated_at: nu, updated_by: null }) })

  // Slack: tekst als citaat, elke regel apart (anders valt alleen de eerste regel in het citaat)
  const citaat = tekst.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!).split('\n').map((r) => `>${r}`).join('\n')
  await channel(`:raising_hand: *Hulpvraag van ${rij.data.name ?? 'een klant'}*${email ? ` (${email})` : ''}\n${citaat}\n<${SITE}/#/klanten/${me.client_id}|Open het klantdossier>`)
    .catch((e) => console.error('Slack-melding hulpvraag mislukt', e))

  return Response.json({ ok: true, hulpvragen })
}
