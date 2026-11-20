// Toegang tot Google-API's met één serviceaccount (Rise-agenda en Google Analytics).
// Nodig in Netlify: GOOGLE_SERVICE_ACCOUNT_EMAIL en GOOGLE_SERVICE_ACCOUNT_KEY (private_key uit het JSON-bestand).
import { createSign } from 'node:crypto'
import { env } from './rise.mts'

export const googleGekoppeld = () => Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_KEY)

const cache = new Map<string, { token: string; tot: number }>()

/** Toegangstoken voor één scope, een uur geldig en zolang bewaard. */
export async function googleToken(scope: string): Promise<string> {
  const c = cache.get(scope)
  if (c && c.tot > Date.now() + 60_000) return c.token
  const nu = Math.floor(Date.now() / 1000)
  const deel = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const ongetekend = `${deel({ alg: 'RS256', typ: 'JWT' })}.${deel({
    iss: env('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: nu,
    exp: nu + 3600,
  })}`
  // In Netlify geplakt als één regel met letterlijke \n (zoals in het JSON-bestand), eventueel met aanhalingstekens eromheen
  const sleutel = env('GOOGLE_SERVICE_ACCOUNT_KEY').trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n')
  const handtekening = createSign('RSA-SHA256').update(ongetekend).sign(sleutel).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${ongetekend}.${handtekening}` }),
  })
  if (!res.ok) throw new Error(`Google-token ${res.status} ${await res.text()}`)
  const j = (await res.json()) as { access_token: string; expires_in: number }
  cache.set(scope, { token: j.access_token, tot: Date.now() + j.expires_in * 1000 })
  return j.access_token
}
