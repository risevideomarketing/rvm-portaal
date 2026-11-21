// Deadlines van taken in de gedeelde Rise-agenda (Google Agenda).
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

// ── Werkblokken inplannen ───────────────────────────────────────────────────
// Elke taak (of deeltaak) krijgt een eigen blok werktijd, 3 tot 5 werkdagen vóór de deadline, in een vrij gat
// in alle agenda's. Belangrijke projecten (strippenkaart of budget boven € 1.500) schuiven bij drukte eerder,
// de rest eerst één dag later. Elk blok is minstens 2 uur, zodat het leesbaar is in de agenda.
const MIN_UREN = 2
const DAG_START = 9 * 60
const DAG_EIND = 17 * 60 + 30

/** Inschatting van de benodigde tijd op basis van de titel (een edit is ongeveer 0,75 werkdag). */
const SCHATTING: [RegExp, number][] = [
  [/draaidag|filmen|opname|shoot|draaien/i, 8],
  [/ruwe edit|eerste versie|montage|monteren|\bedit\b|edit v\d|v1\b/i, 6],
  [/animatie|motion|graphics|titels/i, 5],
  [/script|concept|storyboard|verhaallijn/i, 4],
  [/feedback|correctie|aanpass|v2|v3/i, 3],
  [/draaiboek|shotlist|voorbereid|planning maken/i, 3],
  [/kleur|grading|color|geluid|audio|mix/i, 3],
  [/ondertitel|subtitle|captions/i, 2],
  [/export|oplever|upload|formaten/i, 2],
]
export const schatUren = (titel: string, eigen?: number) => Math.max(MIN_UREN, eigen && eigen > 0 ? eigen : (SCHATTING.find(([r]) => r.test(titel))?.[1] ?? MIN_UREN))

/** Verschil tussen Amsterdam-tijd en UTC op die dag, in minuten (60 of 120). */
const offsetMin = (dag: string) => {
  const t = new Date(`${dag}T12:00:00Z`).toLocaleString('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'shortOffset' })
  const m = t.match(/GMT([+-]\d+)/)
  return (m ? Number(m[1]) : 1) * 60
}
const opDag = (dag: string, min: number) => new Date(Date.UTC(+dag.slice(0, 4), +dag.slice(5, 7) - 1, +dag.slice(8, 10), 0, min - offsetMin(dag)))
const lokaal = (d: Date) => d.toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).replace(' ', 'T').slice(0, 19)

/** n werkdagen vóór een datum (za/zo tellen niet mee). */
function werkdagenVoor(dag: string, n: number) {
  const x = new Date(`${dag}T12:00:00Z`)
  let over = n
  while (over > 0) {
    x.setUTCDate(x.getUTCDate() - 1)
    if (x.getUTCDay() !== 0 && x.getUTCDay() !== 6) over--
  }
  return x.toISOString().slice(0, 10)
}

/** Bezette tijd in alle agenda's (GOOGLE_AGENDAS) tussen twee datums. */
async function bezet(van: string, tot: string): Promise<{ start: number; end: number }[]> {
  const ids = (process.env.GOOGLE_AGENDAS ?? process.env.GOOGLE_CALENDAR_ID ?? '').split(',').map((r) => (r.includes('=') ? r.split('=')[1] : r).trim()).filter(Boolean)
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await googleToken('https://www.googleapis.com/auth/calendar.readonly')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: opDag(van, 0).toISOString(), timeMax: opDag(tot, 24 * 60).toISOString(), timeZone: 'Europe/Amsterdam', items: ids.map((id) => ({ id })) }),
  })
  if (!res.ok) return []
  const j = (await res.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> }
  return Object.values(j.calendars ?? {}).flatMap((c) => c.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
}

/** Vrij blok zoeken: eerst 4 werkdagen vóór de deadline, daarna eerder of één dag later afhankelijk van het belang. */
async function zoekBlok(deadline: string, uren: number, belangrijk: boolean, eigen: Set<string>, stap = false) {
  const vandaag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
  // Hele taak: 3-5 werkdagen vóór de deadline. Deeltaak (al verdeeld over de dagen): de werkdag(en) ervoor.
  const volgorde = stap ? (belangrijk ? [2, 1, 3, 4] : [1, 2, 3]) : belangrijk ? [4, 5, 6, 3, 7, 2, 1] : [4, 3, 5, 2, 6, 1, 7]
  const dagen = volgorde.map((n) => werkdagenVoor(deadline, n)).filter((d) => d >= vandaag)
  if (!dagen.length) dagen.push(vandaag < deadline ? vandaag : deadline)
  const sorted = [...dagen].sort()
  const drukte = (await bezet(sorted[0], sorted[sorted.length - 1])).filter((b) => !eigen.has(`${b.start}-${b.end}`))
  const duur = Math.min(uren * 60, DAG_EIND - DAG_START)
  for (const dag of dagen) {
    for (let m = DAG_START; m + duur <= DAG_EIND; m += 30) {
      const s = opDag(dag, m).getTime()
      const e = s + duur * 60_000
      if (dag === vandaag && s < Date.now()) continue
      if (!drukte.some((b) => b.start < e && b.end > s)) return { start: new Date(s), end: new Date(e) }
    }
  }
  // Alles vol: dan toch op de eerste gekozen dag om 9:00
  const s = opDag(dagen[0], DAG_START)
  return { start: s, end: new Date(s.getTime() + duur * 60_000) }
}

/** Strippenkaart of budget boven € 1.500: belangrijk, dus bij drukte eerder inplannen. */
async function isBelangrijk(t: TaskRow) {
  if (t.priority === 'hoog') return true
  try {
    if (t.projectId) {
      const [p] = await sb<{ data: { bedrag?: number; clientId?: string } }[]>(`projects?select=data&id=eq.${encodeURIComponent(t.projectId)}`)
      if ((p?.data.bedrag ?? 0) > 1500) return true
      t = { ...t, clientId: t.clientId ?? p?.data.clientId }
    }
    if (t.clientId) {
      const [c] = await sb<{ data: { strippenkaart?: { strippen?: unknown[] } } }[]>(`clients?select=data&id=eq.${encodeURIComponent(t.clientId)}`)
      if (c?.data.strippenkaart?.strippen?.length) return true
    }
  } catch { /* geen gegevens: gewoon normaal plannen */ }
  return false
}

/** Bestaande afspraak lezen (om een al ingepland blok niet steeds te verschuiven). */
async function lees(id: string): Promise<{ start?: { dateTime?: string }; end?: { dateTime?: string }; extendedProperties?: { private?: Record<string, string> } } | null> {
  const res = await cal(`/${id}`)
  if (!res.ok) return null
  const j = await res.json()
  return j.status === 'cancelled' ? null : j
}

/** Werkblok zetten of bijwerken: staat er al een blok voor dezelfde deadline en duur, dan blijft het waar het staat. */
async function werkblok(id: string, deadline: string, uren: number, belangrijk: boolean, stap: boolean, inhoud: { summary: string; description: string; colorId: string; prive: Record<string, string> }) {
  const oud = await lees(id)
  let start: string | undefined, end: string | undefined
  const p = oud?.extendedProperties?.private
  if (oud?.start?.dateTime && oud.end?.dateTime && p?.rise_deadline === deadline && p?.rise_uren === String(uren)) {
    start = oud.start.dateTime; end = oud.end.dateTime
  } else {
    const eigen = new Set<string>()
    if (oud?.start?.dateTime && oud.end?.dateTime) eigen.add(`${Date.parse(oud.start.dateTime)}-${Date.parse(oud.end.dateTime)}`)
    const b = await zoekBlok(deadline, uren, belangrijk, eigen, stap)
    start = lokaal(b.start); end = lokaal(b.end)
  }
  await zet(id, {
    summary: inhoud.summary,
    description: inhoud.description,
    start: { dateTime: start, timeZone: 'Europe/Amsterdam' },
    end: { dateTime: end, timeZone: 'Europe/Amsterdam' },
    colorId: inhoud.colorId,
    transparency: 'opaque',
    status: 'confirmed',
    extendedProperties: { private: { ...inhoud.prive, rise_deadline: deadline, rise_uren: String(uren) } },
    source: { title: 'Rise-dashboard', url: `${SITE}/#/taken` },
  })
}

const urenTekst = (u: number) => (u >= 8 ? '1 werkdag' : `${String(u).replace('.', ',')} uur`)

/**
 * Eén taak bijwerken in de Rise-agenda.
 * - Deadline: blok van 2 uur (16:00-18:00) de dag ervoor, rood, telt niet als bezet.
 * - Werk: per deeltaak met een datum (of anders voor de taak zelf) een blok met de geschatte tijd, 3-5 werkdagen
 *   vóór de deadline in een vrij gat. Afgevinkt blijft staan maar doorgestreept. Klaar of zonder deadline: alles eruit.
 */
export async function syncTaak(t: TaskRow, wie?: string): Promise<'gezet' | 'weg' | 'niets'> {
  const id = afspraakId(t.id)
  const hoort = t.inAgenda !== false && t.status !== 'klaar' && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline ?? '')
  const wieTekst = `${wie ? ` · ${wie}` : ''} (${NAAM[t.assignee] ?? t.assignee})`
  const stappen = hoort && t.subtasksConfirmed ? (t.subtasks ?? []).filter((st) => /^\d{4}-\d{2}-\d{2}$/.test(st.deadline ?? '')) : []
  const zelfWerk = hoort && stappen.length === 0
  const werkId = afspraakId(`${t.id}:werk`)

  // Afspraken die er niet meer horen (weggehaald, datum leeg, taak klaar) opruimen
  const gewenst = new Set([...stappen.map((st) => afspraakId(`${t.id}:${st.id}`)), ...(zelfWerk ? [werkId] : [])])
  let opgeruimd = false
  for (const e of await afsprakenVan(t.id)) {
    if (e.id !== id && !gewenst.has(e.id)) opgeruimd = (await weg(e.id)) || opgeruimd
  }

  if (!hoort) return (await weg(id)) || opgeruimd ? 'weg' : 'niets'

  await zet(id, {
    summary: `Deadline: ${t.title}${wieTekst}`,
    description: [`Af vóór ${datumNL(t.deadline)}.`, deeltakenTekst(t), t.description, `Open in het dashboard: ${SITE}/#/taken`].filter(Boolean).join('\n\n'),
    start: { dateTime: `${dagErvoor(t.deadline)}T16:00:00`, timeZone: 'Europe/Amsterdam' },
    end: { dateTime: `${dagErvoor(t.deadline)}T18:00:00`, timeZone: 'Europe/Amsterdam' },
    colorId: KLEUR_HOOFD,
    transparency: 'transparent',
    status: 'confirmed',
    extendedProperties: { private: { rise_task: t.id, rise_sub: 'hoofd' } },
    source: { title: 'Rise-dashboard', url: `${SITE}/#/taken` },
  })

  const belangrijk = await isBelangrijk(t)
  if (zelfWerk) {
    const uren = schatUren(t.title, t.uren)
    await werkblok(werkId, t.deadline, uren, belangrijk, false, {
      summary: `${t.title}${wieTekst}`,
      description: [`Ingeplande werktijd: ${urenTekst(uren)}. Af vóór ${datumNL(t.deadline)}.`, belangrijk ? 'Belangrijk project: met voorrang ingepland.' : undefined, t.description, `Open in het dashboard: ${SITE}/#/taken`].filter(Boolean).join('\n\n'),
      colorId: KLEUR_STAP,
      prive: { rise_task: t.id, rise_sub: 'werk' },
    })
  }

  const alle = t.subtasks ?? []
  for (const st of stappen) {
    const nr = alle.findIndex((x) => x.id === st.id) + 1
    const uren = schatUren(st.title, st.uren)
    await werkblok(afspraakId(`${t.id}:${st.id}`), st.deadline!, uren, belangrijk, true, {
      summary: `${st.done ? `✓ ${doorgestreept(st.title)}` : st.title} · ${t.title}${wieTekst}`,
      description: [`Stap ${nr} van ${alle.length} van "${t.title}". Ingeplande werktijd: ${urenTekst(uren)}. Af vóór ${datumNL(st.deadline!)}, de taak zelf af vóór ${datumNL(t.deadline)}.`, deeltakenTekst(t), `Open in het dashboard: ${SITE}/#/taken`].filter(Boolean).join('\n\n'),
      colorId: KLEUR_STAP,
      prive: { rise_task: t.id, rise_sub: st.id },
    })
  }
  return 'gezet'
}
