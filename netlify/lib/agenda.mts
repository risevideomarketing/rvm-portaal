// Rise-agenda (Google Agenda): alleen de definitieve opleverdatum van video's, als hele dag. Taken komen er niet meer in.
// Een serviceaccount schrijft de afspraken; de agenda is met dat account gedeeld met "Wijzigingen aanbrengen in afspraken".
// Nodig in Netlify: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY (private_key uit het JSON-bestand), GOOGLE_CALENDAR_ID.
// Elke taak heeft een vaste afspraak-id (afgeleid van de taak-id), dus opnieuw synchroniseren maakt nooit dubbele afspraken.
import { createHash } from 'node:crypto'
import { googleGekoppeld, googleToken } from './google.mts'
import { SITE, env, sb, type TaskRow } from './rise.mts'

export const agendaGekoppeld = () => googleGekoppeld() && Boolean(process.env.GOOGLE_CALENDAR_ID)

async function cal(pad: string, init: RequestInit = {}) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env('GOOGLE_CALENDAR_ID'))}/events${pad}`
  return fetch(url, { ...init, headers: { Authorization: `Bearer ${await googleToken('https://www.googleapis.com/auth/calendar.events')}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
}

/** Afspraak-id voor Google: alleen 0-9 en a-v toegestaan, hex valt daarbinnen. */
const afspraakId = (taskId: string) => `rise${createHash('sha1').update(taskId).digest('hex')}`

const NAAM: Record<string, string> = { lars: 'Lars', daan: 'Daan', joost: 'Joost' }

/** "Af vóór D" = deadline op de dag ervoor om 18:00 (zelfde regel als in het dashboard). */
const dagErvoor = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() - 1)
  return x.toISOString().slice(0, 10)
}
const plusEenDag = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + 1)
  return x.toISOString().slice(0, 10)
}
const datumNL = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' })

/** Doorgestreepte tekst die overal werkt (Google Agenda, telefoon, mail): elk teken met een streep erdoor. */
const doorgestreept = (x: string) => [...x].map((c) => `${c}\u0336`).join('')

/** Deeltaken als lijstje in de omschrijving: afgevinkt is doorgestreept, met de voortgang erboven. */
export const deeltakenTekst = (t: TaskRow) => {
  const subs = t.subtasksConfirmed ? (t.subtasks ?? []) : []
  if (!subs.length) return undefined
  const af = subs.filter((st) => st.done).length
  return [`Deeltaken (${af} van ${subs.length} af):`, ...subs.map((st) => (st.done ? `✓ ${doorgestreept(st.title)}` : `○ ${st.title}${st.deadline ? ` (vóór ${datumNL(st.deadline)})` : ''}`))].join('\n')
}

/** Kleuren in Google Agenda: hoofddeadline rood (Tomaat), deeltaken blauw (Bosbes). */
const KLEUR_HOOFD = '11'
const KLEUR_STAP = '9'

/** Afspraak aanmaken of bijwerken op een vaste id (opnieuw synchroniseren maakt nooit dubbele afspraken). */
async function zet(id: string, afspraak: object) {
  let res = await cal(`/${id}`, { method: 'PUT', body: JSON.stringify(afspraak) })
  if (res.status === 404) res = await cal('', { method: 'POST', body: JSON.stringify({ id, ...afspraak }) })
  if (!res.ok) throw new Error(`Agenda ${id} ${res.status} ${await res.text()}`)
}

/** Afspraak weghalen; bestond hij niet (meer), dan is dat prima. */
async function weg(id: string): Promise<boolean> {
  const res = await cal(`/${id}`, { method: 'DELETE' })
  if (res.ok) return true
  if (res.status === 404 || res.status === 410) return false
  throw new Error(`Agenda verwijderen ${res.status} ${await res.text()}`)
}

/** Alle afspraken van deze taak die het dashboard ooit zette (hoofddeadline en stappen). */
async function afsprakenVan(taskId: string): Promise<{ id: string; sub?: string }[]> {
  const res = await cal(`?privateExtendedProperty=${encodeURIComponent(`rise_task=${taskId}`)}&maxResults=250`)
  if (!res.ok) throw new Error(`Agenda lezen ${res.status} ${await res.text()}`)
  const j = (await res.json()) as { items?: { id: string; extendedProperties?: { private?: { rise_sub?: string } } }[] }
  return (j.items ?? []).map((e) => ({ id: e.id, sub: e.extendedProperties?.private?.rise_sub }))
}

/** Verwijderde taak: hoofddeadline en alle stappen uit de agenda. */
export async function wegTaak(taskId: string): Promise<boolean> {
  let iets = await weg(afspraakId(taskId))
  for (const e of await afsprakenVan(taskId)) iets = (await weg(e.id)) || iets
  return iets
}

/** Taken komen niet meer in de agenda (Daan, 23 nov 2026): alles wat het dashboard ooit voor deze taak zette, gaat eruit. */
export async function syncTaak(t: TaskRow, _wie?: string): Promise<'gezet' | 'weg' | 'niets'> {
  return (await wegTaak(t.id)) ? 'weg' : 'niets'
}

export type ProjectRow = { id: string; name: string; soort?: string; clientId?: string; fase?: string; deadline?: string }

/** Alleen de definitieve oplevering van een video staat in de Rise-agenda: een hele-dag-afspraak op de opleverdag. */
export async function syncProject(p: ProjectRow, klant?: string): Promise<'gezet' | 'weg' | 'niets'> {
  const id = afspraakId(`project:${p.id}`)
  const hoort = p.soort === 'productie' && p.fase !== 'live' && /^\d{4}-\d{2}-\d{2}$/.test(p.deadline ?? '')
  if (!hoort) return (await weg(id)) ? 'weg' : 'niets'
  await zet(id, {
    summary: `Oplevering: ${p.name}${klant && !p.name.toLowerCase().includes(klant.toLowerCase()) ? ` · ${klant}` : ''}`,
    description: [`Definitieve oplevering van de video.`, `Open in het dashboard: ${SITE}/#/productie/${p.id}`].join('\n\n'),
    start: { date: p.deadline }, end: { date: plusEenDag(p.deadline!) },
    colorId: KLEUR_HOOFD, transparency: 'transparent', status: 'confirmed',
    extendedProperties: { private: { rise_project: p.id } },
    source: { title: 'Rise-dashboard', url: `${SITE}/#/productie/${p.id}` },
  })
  return 'gezet'
}

/** Eenmalig opruimen: alle afspraken die het dashboard voor taken zette (deadlines en werkblokken) uit de agenda. */
export async function taakAfsprakenOpruimen(): Promise<number> {
  let n = 0
  let page: string | undefined
  const van = new Date(Date.now() - 120 * 864e5).toISOString()
  do {
    const res = await cal(`?timeMin=${encodeURIComponent(van)}&maxResults=250&singleEvents=true${page ? `&pageToken=${page}` : ''}`)
    if (!res.ok) throw new Error(`Agenda lezen ${res.status} ${await res.text()}`)
    const j = (await res.json()) as { items?: { id: string; extendedProperties?: { private?: Record<string, string> } }[]; nextPageToken?: string }
    for (const e of j.items ?? []) if (e.extendedProperties?.private?.rise_task) n += (await weg(e.id)) ? 1 : 0
    page = j.nextPageToken
  } while (page)
  return n
}
