import { createHmac } from 'node:crypto'
// Gedeeld door de Netlify Functions. Draait alleen op de server: hier mogen de geheime sleutels komen.
// Nodig in Netlify → Environment variables:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SLACK_BOT_TOKEN, (optioneel) SLACK_CHANNEL
//   Moneybird (statistieken): MONEYBIRD_TOKEN, MONEYBIRD_ADMINISTRATION_ID
//   Meta (resultaten in het portaal): META_ACCESS_TOKEN (systeemgebruiker Rise-portfolio, ads_read)
//   Google Agenda (deadlines van taken): GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_CALENDAR_ID

export const env = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Ontbrekende omgevingsvariabele: ${k}`)
  return v.trim() // geplakte sleutels kunnen een regeleinde of spatie meenemen
}

export const SITE = process.env.URL ?? 'https://rvm-dashboard.netlify.app'

// ── Supabase (service role: omzeilt RLS, dus alleen hier gebruiken) ─────────
export async function sb<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  // Nieuwe sleutels (sb_secret_…) alleen als apikey; oude JWT-sleutels (eyJ…) ook als Bearer
  const auth = key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, ...auth, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export interface TaskRow {
  id: string
  title: string
  deadline: string
  assignee: string
  status: string
  clientId?: string
  contactId?: string
  startedAt?: string
  updatedAt?: string
  inAgenda?: boolean
  description?: string
  projectId?: string
  inTodo?: boolean
  subtasks?: { id: string; title: string; done: boolean; deadline?: string }[]
  subtasksConfirmed?: boolean
}

export interface ContactRow {
  id: string
  name: string
  company: string
  owner: string
  opvolgen?: string
  timeline?: { at: string; body: string }[]
}

export const contactRows = async () => (await sb<{ data: ContactRow }[]>('contacts?select=data')).map((r) => r.data)

export const tasks = async () => (await sb<{ data: TaskRow }[]>('tasks?select=data')).map((r) => r.data)

export const names = async (table: 'clients' | 'contacts') =>
  new Map((await sb<{ id: string; data: { name?: string; company?: string } }[]>(`${table}?select=id,data`)).map((r) => [r.id, r.data.company ?? r.data.name ?? '']))

/** Eén keer versturen: true als deze sleutel nieuw is. */
export async function claim(key: string): Promise<boolean> {
  const rows = await sb<unknown[]>('sent_notifications', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({ key }),
  })
  return Array.isArray(rows) && rows.length > 0
}

/** Persoon (lars/daan/joost) → e-mailadres voor Slack. */
export async function team(): Promise<Map<string, string>> {
  const rows = await sb<{ email: string; person: string; slack_email: string | null }[]>('allowed_users?select=email,person,slack_email&person=not.is.null&role=neq.uit')
  return new Map(rows.map((r) => [r.person, r.slack_email || r.email]))
}

/** Zoals verifyUser, maar ook voor klanten: geeft rol en klant terug (team: client_id leeg). */
export async function verifyAny(token: string | null) {
  if (!token) return null
  const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { id: string }
  const [profile] = await sb<{ person: string | null; role: string; client_id: string | null }[]>(`profiles?select=person,role,client_id&user_id=eq.${user.id}`)
  return profile ?? null
}

/** Controleert het Supabase-token van de ingelogde gebruiker en geeft zijn profiel terug. */
export async function verifyUser(token: string | null) {
  if (!token) return null
  const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { id: string }
  const [profile] = await sb<{ person: string; role: string }[]>(`profiles?select=person,role&user_id=eq.${user.id}`)
  return profile && ['admin', 'medewerker', 'sales'].includes(profile.role) ? profile : null
}

/** Heeft dit teamlid een recht (vinkje op Instellingen)? Beheerders altijd. */
const STANDAARD: Record<string, boolean> = { taken_alle: true, crm: true, crm_bewerken: true, klanten: true, klanttaken: true, projecten: true }
export async function heeftRecht(person: string, role: string, recht: string) {
  if (role === 'admin') return true
  if (role === 'uit') return false
  const [rij] = await sb<{ rechten: Record<string, boolean> | null }[]>(`allowed_users?select=rechten&person=eq.${encodeURIComponent(person)}`)
  return rij?.rechten?.[recht] ?? STANDAARD[recht] ?? false
}

// ── Slack ───────────────────────────────────────────────────────────────────
async function slack<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('SLACK_BOT_TOKEN')}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as T & { ok: boolean; error?: string }
  if (!json.ok) throw new Error(`Slack ${method}: ${json.error}`)
  return json
}

const userIds = new Map<string, string>()
async function slackUser(email: string) {
  if (!userIds.has(email)) {
    const res = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${env('SLACK_BOT_TOKEN')}` },
    })
    const json = (await res.json()) as { ok: boolean; error?: string; user?: { id: string } }
    if (!json.ok || !json.user) throw new Error(`Slack-gebruiker ${email} niet gevonden: ${json.error}`)
    userIds.set(email, json.user.id)
  }
  return userIds.get(email)!
}

/** DM aan een teamlid (lars/daan/joost). */
export async function dm(person: string, text: string, emails: Map<string, string>, soort?: 'deadline' | 'stil' | 'tag' | 'opvolgen') {
  if (soort) {
    // Meldingen die iemand zelf heeft uitgezet (Instellingen → Meldingen) niet sturen
    const [rij] = await sb<{ meldingen: Record<string, boolean> | null }[]>(`allowed_users?select=meldingen&person=eq.${encodeURIComponent(person)}`)
    if (rij?.meldingen?.[soort] === false) return
  }
  const email = emails.get(person)
  if (!email) throw new Error(`Geen mailadres voor ${person}`)
  await slack('chat.postMessage', { channel: await slackUser(email), text, unfurl_links: false })
}

/** Bericht in het teamkanaal (standaard #rise-videomarketing; de bot moet in het kanaal zitten). */
/** Algemene melding (klantberichten, aanleveringen, portaal). Standaard in de app "Rise Video Marketing Agency" zelf
 *  (onder Apps in Slack, als bericht aan Daan). SLACK_CHANNEL mag ook een kanaal zijn (#naam of ID) of een ander mailadres. */
export async function channel(text: string) {
  const doel = (process.env.SLACK_CHANNEL || 'daan@risevideomarketing.nl').trim()
  const naar = doel.includes('@') ? await slackUser(doel) : doel.replace(/^#/, '')
  await slack('chat.postMessage', { channel: naar, text, unfurl_links: false })
}

export const taskLink = (t: TaskRow) => `<${SITE}/#/taken|${t.title}>`

/** Datum (YYYY-MM-DD) in Nederland, met dagen erbij opgeteld. */
export function dateNL(addDays = 0, now = new Date()) {
  const d = new Date(now.getTime() + addDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Uren sinds een moment, alleen ma t/m vr meegeteld (zelfde regel als in het dashboard). */
export function werkurenSinds(iso: string, now = new Date()) {
  let t = new Date(iso).getTime()
  let hours = 0
  while (t < now.getTime()) {
    const step = Math.min(3600000, now.getTime() - t)
    const day = new Date(t).getDay()
    if (day !== 0 && day !== 6) hours += step / 3600000
    t += step
  }
  return Math.floor(hours)
}

/** Korte handtekening (HMAC) over een tekst, met de serversleutel; voor links zoals afmelden. */
export function teken(tekst: string) {
  return createHmac('sha256', env('SUPABASE_SERVICE_ROLE_KEY')).update(tekst).digest('hex').slice(0, 32)
}
