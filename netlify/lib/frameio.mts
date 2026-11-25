// Frame.io V4 API (Adobe IMS OAuth, "Web App"-koppeling). Daan logt één keer in via frameio-auth;
// de tokens staan daarna in een privé Supabase Storage-bucket "systeem" (alleen de service role kan erbij).
// Nodig in Netlify → Environment variables: FRAMEIO_CLIENT_ID, FRAMEIO_CLIENT_SECRET (uit de Adobe Developer Console).
import { SITE, env } from './rise.mts'

const IMS = 'https://ims-na1.adobelogin.com/ims'
const API = 'https://api.frame.io/v4'
export const SCOPES = 'openid,AdobeID,offline_access,profile,email,additional_info.roles'
export const REDIRECT = `${SITE}/.netlify/functions/frameio-auth`

interface Opslag { refresh_token: string; access_token?: string; expires_at?: number; account_id?: string }

const opslagUrl = () => `${env('SUPABASE_URL')}/storage/v1/object/systeem/frameio.json`
const sleutel = () => {
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  return { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) }
}

async function lees(): Promise<Opslag | null> {
  const res = await fetch(opslagUrl(), { headers: sleutel() })
  if (!res.ok) return null
  try { return (await res.json()) as Opslag } catch { return null }
}

export async function bewaar(o: Opslag) {
  // Bucket aanmaken als die er nog niet is (privé, geen policies: alleen de service role)
  await fetch(`${env('SUPABASE_URL')}/storage/v1/bucket`, {
    method: 'POST', headers: { ...sleutel(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'systeem', name: 'systeem', public: false }),
  }).catch(() => null)
  const res = await fetch(opslagUrl(), {
    method: 'POST', headers: { ...sleutel(), 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: JSON.stringify(o),
  })
  if (!res.ok) throw new Error(`Opslaan Frame.io-tokens mislukt: ${res.status} ${await res.text()}`)
}

export const gekoppeld = async () => Boolean((await lees())?.refresh_token)

/** Code uit de OAuth-terugkoppeling inwisselen voor tokens. */
export async function wisselCode(code: string) {
  const res = await fetch(`${IMS}/token/v3`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: env('FRAMEIO_CLIENT_ID'), client_secret: env('FRAMEIO_CLIENT_SECRET'), code }),
  })
  const j = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string }
  if (!res.ok || !j.refresh_token) throw new Error(j.error_description ?? `IMS ${res.status}`)
  await bewaar({ refresh_token: j.refresh_token, access_token: j.access_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000 })
}

async function token(): Promise<{ token: string; o: Opslag }> {
  const o = await lees()
  if (!o?.refresh_token) throw new NietGekoppeld()
  if (o.access_token && (o.expires_at ?? 0) > Date.now()) return { token: o.access_token, o }
  const res = await fetch(`${IMS}/token/v3`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env('FRAMEIO_CLIENT_ID'), client_secret: env('FRAMEIO_CLIENT_SECRET'), refresh_token: o.refresh_token }),
  })
  const j = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!res.ok || !j.access_token) throw new NietGekoppeld()
  const nieuw = { ...o, access_token: j.access_token, refresh_token: j.refresh_token ?? o.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000 }
  await bewaar(nieuw)
  return { token: j.access_token, o: nieuw }
}

export class NietGekoppeld extends Error { constructor() { super('Frame.io is nog niet gekoppeld') } }

export async function fio<T = unknown>(pad: string, init: RequestInit = {}): Promise<T> {
  const { token: t } = await token()
  const res = await fetch(`${API}${pad}`, { ...init, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`Frame.io ${pad}: ${res.status} ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : null) as T
}

/** Het Frame.io-account (eerste account van de gekoppelde gebruiker), onthouden in de opslag. */
export async function accountId(): Promise<string> {
  const { o } = await token()
  if (o.account_id) return o.account_id
  const j = await fio<{ data: { id: string }[] }>('/accounts')
  const id = j.data?.[0]?.id
  if (!id) throw new Error('Geen Frame.io-account gevonden')
  await bewaar({ ...o, account_id: id })
  return id
}

/** Share-id uit een deellink (next.frame.io/share/<uuid>/…). */
export const shareId = (url?: string) => url?.match(/\/share\/([0-9a-f-]{36})/i)?.[1] ?? null
