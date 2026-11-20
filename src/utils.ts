// Demostand rekent vanaf een vaste dag (de voorbeelddata is daarop gemaakt); live is het gewoon nu.
export const TODAY = new Date()

/** De gedeelde Rise-agenda in Google Agenda; deadlines van taken komen hier automatisch in. */
export const AGENDA_URL = 'https://calendar.google.com/calendar/u/0/r'

export const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const daysUntil = (iso: string) => {
  const a = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  const n = new Date()
  const b = new Date(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T00:00:00`)
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

/**
 * Een deadline in het dashboard is de dag waarvóór het af moet. De echte deadline is de dag ervoor om 18:00:
 * "af vóór 24 november" = 23 november 18:00. Zo staat hij ook in de Rise-agenda.
 */
export const DEADLINE_UUR = 18
/** Staat de taak op de to-do lijst? Projecttaken alleen als iemand ze er bewust op zet. */
export const opTodo = (t: { projectId?: string; inTodo?: boolean }) => !t.projectId || t.inTodo === true

/** Datum over n werkdagen (YYYY-MM-DD). */
export function werkdagenVooruit(n: number, vanaf: Date = new Date()): string {
  const x = new Date(vanaf)
  while (n > 0) {
    x.setDate(x.getDate() + 1)
    if (x.getDay() !== 0 && x.getDay() !== 6) n--
  }
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** Standaard "af vóór"-datum: de echte deadline valt dan over 3 werkdagen om 18:00 (nooit in het weekend). */
export function standaardAfVoor(vanaf: Date = new Date()): string {
  const x = new Date(`${werkdagenVooruit(3, vanaf)}T12:00:00`)
  x.setDate(x.getDate() + 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/**
 * Sub-deadlines voorstellen: stappen zonder datum worden verdeeld over de werkdagen van morgen tot de hoofddeadline,
 * de laatste stap valt op de hoofddeadline. Bestaande datums en afgevinkte stappen blijven staan.
 * Datums zijn "af vóór"-data, net als de deadline van de taak.
 */
export function verdeelDeadlines<T extends { deadline?: string; done?: boolean }>(subs: T[], afVoor: string, vanaf: Date = new Date()): T[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(afVoor ?? '')) return subs
  const open = subs.filter((st) => !st.deadline && !st.done)
  if (!open.length) return subs
  const eind = deadlineDag(afVoor)
  const dag = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  const dagen: string[] = []
  const x = new Date(vanaf)
  x.setHours(12, 0, 0, 0)
  for (let i = 0; i < 400; i++) {
    x.setDate(x.getDate() + 1)
    if (dag(x) > eind) break
    if (x.getDay() !== 0 && x.getDay() !== 6) dagen.push(dag(x))
  }
  if (dagen[dagen.length - 1] !== eind) dagen.push(eind)
  const naAfVoor = (d: string) => {
    const y = new Date(`${d}T12:00:00`)
    y.setDate(y.getDate() + 1)
    return dag(y)
  }
  let k = 0
  return subs.map((st) => {
    if (st.deadline || st.done) return st
    k++
    return { ...st, deadline: naAfVoor(dagen[Math.max(0, Math.ceil((k * dagen.length) / open.length) - 1)]) }
  })
}

export const deadlineDag = (iso: string) => {
  const x = new Date(`${iso.slice(0, 10)}T12:00:00`)
  x.setDate(x.getDate() - 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const teLaat = (iso: string, now: Date = new Date()) => Boolean(iso) && now >= new Date(`${deadlineDag(iso)}T${DEADLINE_UUR}:00:00`)

/** "Vandaag 18:00", "Morgen 18:00", "maandag 18:00", "23 nov. 18:00" of "2 dagen te laat". Afgerond (klaar) = nooit "te laat". */
export const deadlineLabel = (iso: string, klaar = false) => {
  if (!iso) return 'Geen deadline'
  const dag = deadlineDag(iso)
  const d = daysUntil(dag)
  if (klaar) return `${fmtDate(dag)} ${DEADLINE_UUR}:00`
  if (teLaat(iso)) return d >= 0 ? 'Te laat (vandaag 18:00)' : `${-d} dag${d === -1 ? '' : 'en'} te laat`
  if (d === 0) return `Vandaag ${DEADLINE_UUR}:00`
  if (d === 1) return `Morgen ${DEADLINE_UUR}:00`
  if (d < 7) return `${new Date(`${dag}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long' })} ${DEADLINE_UUR}:00`
  return `${fmtDate(dag)} ${DEADLINE_UUR}:00`
}

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 20)

/** Herkenbare naam voor een contentlink. */
export const bronVan = (url: string) => {
  const h = (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } })()
  if (/drive\.google|docs\.google/.test(h)) return 'Google Drive'
  if (/sharepoint|onedrive|1drv/.test(h)) return 'SharePoint / OneDrive'
  if (/frame\.io|f\.io/.test(h)) return 'Frame.io'
  if (/dropbox/.test(h)) return 'Dropbox'
  if (/wetransfer|we\.tl/.test(h)) return 'WeTransfer'
  return h
}

/** Pakketnaam zonder bedragen (voor wie geen geld mag zien en voor het portaal). */
export const pakketNaam = (p: string) => p.replace(/\s*\(.*?€.*?\)/g, '').replace(/\s*[·,-]?\s*€.*$/, '').trim()
