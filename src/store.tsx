// Centrale state. Twee standen:
// - lokaal (geen Supabase-sleutels): momentopname uit src/data/lokaal.json in localStorage, per browser;
// - live: data uit Supabase, elke wijziging direct opgeslagen en live gedeeld binnen het team.
import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react'
import { CLIENTS, CONTACTS, KLEUREN, PROJECTS, RECHTEN, TASKS, TEAM, TEAM_VAST } from './data/mock'
import type { Lang } from './i18n'
import { proposalReminders } from './rules'
import { agendaSync } from './slack'
import { supabase } from './supabase'
import { verdeelDeadlines } from './utils'
import type { Client, Comment, Contact, Melding, Niveau, Person, PersonId, PortaalProductie, ProductieFase, Project, ProjectUpdate, Recht, Rechten, Stage, Subtask, Task, TimelineItem } from './data/types'

interface State {
  me: PersonId
  /** Het hele team met niveau en rechten (live uit allowed_users, lokaal de vaste lijst). */
  team: Person[]
  live: boolean
  ready: boolean
  lang: Lang
  tasks: Task[]
  contacts: Contact[]
  clients: Client[]
  projects: Project[]
  notionUrl: string
}

type Table = 'tasks' | 'contacts' | 'clients' | 'projects'
const TABLES = ['tasks', 'contacts', 'clients', 'projects'] as const
type Rij = Task | Contact | Client | Project

type Action =
  | { type: 'me'; me: PersonId }
  | { type: 'lang'; lang: Lang }
  | { type: 'task:upsert'; task: Task }
  | { type: 'task:comment'; taskId: string; comment: Comment }
  | { type: 'task:weg'; id: string }
  | { type: 'remote:weg'; table: Table; id: string }
  | { type: 'weg'; table: Exclude<Table, 'tasks'>; id: string }
  | { type: 'contact:stage'; id: string; stage: Stage }
  | { type: 'contact:timeline'; id: string; item: TimelineItem }
  | { type: 'contact:patch'; id: string; patch: Partial<Contact> }
  | { type: 'contact:upsert'; contact: Contact }
  | { type: 'client:upsert'; client: Client }
  | { type: 'project:upsert'; project: Project }
  | { type: 'project:update'; id: string; update: ProjectUpdate }
  | { type: 'project:update:weg'; id: string; updateId: string }
  | { type: 'notion'; url: string }
  | { type: 'reset' }
  | { type: 'load'; tasks: Task[]; contacts: Contact[]; clients: Client[]; projects: Project[] }
  | { type: 'remote'; table: Table; obj: Rij }
  | { type: 'team'; team: Person[] }

const KEY = 'rise-dashboard-v2' // v1 bevatte voorbeelddata
const NOTION_KEY = 'rise-dashboard-notion'

const demo: State = { me: 'daan', team: TEAM, live: false, ready: true, lang: 'nl', tasks: TASKS, contacts: CONTACTS, clients: CLIENTS, projects: PROJECTS, notionUrl: '' }

function loadDemo(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return demo
    const s = { ...demo, ...JSON.parse(raw), live: false, ready: true } as State
    if (!Array.isArray(s.projects)) s.projects = PROJECTS
    // Nieuwe velden uit de momentopname (website, kaartafbeelding) aanvullen bij contacten die ze nog niet hebben
    const snap = new Map(CONTACTS.map((c) => [c.id, c]))
    s.contacts = s.contacts.map((c) => {
      const x = snap.get(c.id)
      return x && (c.website === undefined || c.logo === undefined) ? { ...c, website: c.website ?? x.website, logo: c.logo ?? x.logo } : c
    })
    // Schermafbeeldingen van websites (jpeg) uit de vorige kaartstijl weghalen; logo's worden nu als png opgeslagen
    s.contacts = s.contacts.map((c) => (c.logo?.startsWith('data:image/jpeg') ? { ...c, logo: undefined } : c))
    const snapKlant = new Map(CLIENTS.map((c) => [c.id, c]))
    s.clients = s.clients.map((c) => {
      const x = snapKlant.get(c.id)
      return x && c.websiteWerk === undefined && x.websiteWerk ? { ...c, websiteWerk: x.websiteWerk } : c
    })
    return s
  } catch {
    return demo
  }
}

/** Producties van een klant samenvatten voor het portaal: geen bedragen, geen notities, alleen updates met vinkje "klant". */
export function portaalProducties(projects: Project[], clientId: string): PortaalProductie[] {
  return projects
    .filter((p) => p.soort === 'productie' && p.clientId === clientId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      fase: ((p.fase as ProductieFase) || 'productie'),
      ...(p.contentSoort ? { contentSoort: p.contentSoort } : {}),
      ...(p.deadline ? { deadline: p.deadline } : {}),
      updates: p.updates.filter((u) => u.klant).slice(0, 5).map((u) => ({ date: u.date, text: u.text })),
    }))
    .sort((a, b) => (a.deadline ?? '9').localeCompare(b.deadline ?? '9'))
}

/** Na een wijziging aan producties: de samenvatting op de betrokken klantrijen bijwerken (alleen als er echt iets veranderde). */
function syncProducties(s: State, clientIds: (string | undefined)[]): State {
  let clients = s.clients
  for (const id of new Set(clientIds.filter(Boolean) as string[])) {
    const c = clients.find((x) => x.id === id)
    if (!c) continue
    const nieuw = portaalProducties(s.projects, id)
    if (JSON.stringify(nieuw) === JSON.stringify(c.producties ?? [])) continue
    clients = clients.map((x) => (x.id === id ? { ...x, producties: nieuw } : x))
  }
  return clients === s.clients ? s : { ...s, clients }
}

const replace = <T extends { id: string }>(list: T[], obj: T, prepend = false) =>
  list.some((x) => x.id === obj.id) ? list.map((x) => (x.id === obj.id ? obj : x)) : prepend ? [obj, ...list] : [...list, obj]

function reducer(s: State, a: Action): State {
  const n = reducerBasis(s, a)
  // Producties van klanten: portaal-samenvatting bijwerken
  if (a.type === 'project:upsert' || a.type === 'project:update' || a.type === 'project:update:weg' || (a.type === 'weg' && a.table === 'projects')) {
    const oud = s.projects.find((p) => p.id === ('project' in a ? a.project.id : a.id))
    const nw = n.projects.find((p) => p.id === ('project' in a ? a.project.id : a.id))
    return syncProducties(n, [oud?.clientId, nw?.clientId])
  }
  return n
}

function reducerBasis(s: State, a: Action): State {
  switch (a.type) {
    case 'load':
      return { ...s, ready: true, tasks: a.tasks, contacts: a.contacts, clients: a.clients, projects: a.projects }
    case 'remote':
      return { ...s, [a.table]: replace(s[a.table] as { id: string }[], a.obj, a.table === 'tasks') }
    case 'me':
      return { ...s, me: a.me }
    case 'team':
      return { ...s, team: a.team }
    case 'lang':
      return { ...s, lang: a.lang }
    case 'task:weg':
      return { ...s, tasks: s.tasks.filter((t) => t.id !== a.id) }
    case 'weg':
      return { ...s, [a.table]: (s[a.table] as { id: string }[]).filter((x) => x.id !== a.id) }
    case 'remote:weg':
      return { ...s, [a.table]: (s[a.table] as { id: string }[]).filter((x) => x.id !== a.id) }
    case 'task:upsert': {
      const exists = s.tasks.some((t) => t.id === a.task.id)
      return { ...s, tasks: exists ? s.tasks.map((t) => (t.id === a.task.id ? a.task : t)) : [a.task, ...s.tasks] }
    }
    case 'task:comment':
      return { ...s, tasks: s.tasks.map((t) => (t.id === a.taskId ? { ...t, comments: [...t.comments, a.comment], updatedAt: a.comment.at } : t)) }
    case 'contact:stage':
      return { ...s, contacts: s.contacts.map((c) => (c.id === a.id ? { ...c, stage: a.stage } : c)) }
    case 'contact:timeline':
      return { ...s, contacts: s.contacts.map((c) => (c.id === a.id ? { ...c, timeline: [a.item, ...c.timeline] } : c)) }
    case 'contact:upsert':
      return { ...s, contacts: s.contacts.some((c) => c.id === a.contact.id) ? s.contacts.map((c) => (c.id === a.contact.id ? a.contact : c)) : [a.contact, ...s.contacts] }
    case 'contact:patch':
      return { ...s, contacts: s.contacts.map((c) => (c.id === a.id ? { ...c, ...a.patch } : c)) }
    case 'client:upsert': {
      const exists = s.clients.some((c) => c.id === a.client.id)
      return { ...s, clients: exists ? s.clients.map((c) => (c.id === a.client.id ? a.client : c)) : [...s.clients, a.client] }
    }
    case 'project:upsert':
      return { ...s, projects: replace(s.projects, a.project) }
    case 'project:update':
      return { ...s, projects: s.projects.map((p) => (p.id === a.id ? { ...p, updates: [a.update, ...p.updates] } : p)) }
    case 'project:update:weg':
      return { ...s, projects: s.projects.map((p) => (p.id === a.id ? { ...p, updates: p.updates.filter((u) => u.id !== a.updateId) } : p)) }
    case 'notion':
      return { ...s, notionUrl: a.url }
    case 'reset':
      return s.live ? s : { ...demo, me: s.me, lang: s.lang }
  }
}

const Ctx = createContext<{ s: State; d: (a: Action) => void } | null>(null)

/**
 * @param live  ingelogd via Supabase; anders demostand
 * @param me    wie er is ingelogd (uit het profiel)
 * @param userId Supabase-gebruiker, om eigen wijzigingen uit de live-stroom te herkennen
 */
export function StoreProvider({ children, live = false, me = 'daan', userId }: { children: ReactNode; live?: boolean; me?: PersonId; userId?: string }) {
  const [s, d] = useReducer(reducer, undefined, () =>
    live ? { me, team: TEAM, live: true, ready: false, lang: (localStorage.getItem('rise-dashboard-lang') as Lang) || 'nl', tasks: [], contacts: [], clients: [], projects: [], notionUrl: localStorage.getItem(NOTION_KEY) ?? '' } : loadDemo(),
  )
  const remote = useRef(new WeakSet<object>())
  // Gewijzigde taken verzamelen en na 3 seconden in één keer naar de Google Agenda sturen
  const agendaRij = useRef<{ ids: Set<string>; timer?: number }>({ ids: new Set() })
  const naarAgenda = (ids: string[]) => {
    const q = agendaRij.current
    ids.forEach((id) => q.ids.add(id))
    clearTimeout(q.timer)
    q.timer = window.setTimeout(() => {
      const lijst = [...q.ids]
      q.ids.clear()
      agendaSync(lijst)
    }, 3000)
  }
  const prev = useRef<Record<Table, Map<string, object>>>({ tasks: new Map(), contacts: new Map(), clients: new Map(), projects: new Map() })

  // Live: alles ophalen uit Supabase (geen voorbeelddata)
  useEffect(() => {
    if (!live || !supabase) return
    const sb = supabase
    let stop = false
    ;(async () => {
      const get = async <T,>(t: Table) => {
        const { data, error } = await sb.from(t).select('data').order('updated_at', { ascending: false })
        if (error) throw error
        return (data ?? []).map((r) => r.data as T)
      }
      const [tasks, contacts, clients, projects] = await Promise.all([get<Task>('tasks'), get<Contact>('contacts'), get<Client>('clients'), get<Project>('projects')])
      if (stop) return
      for (const [t, list] of [['tasks', tasks], ['contacts', contacts], ['clients', clients], ['projects', projects]] as const) {
        prev.current[t] = new Map((list as { id: string }[]).map((x) => [x.id, x]))
      }
      d({ type: 'load', tasks, contacts, clients, projects })
    })().catch((e) => console.error('Laden uit Supabase mislukt', e))

    // Het team (namen, niveau, rechten) uit allowed_users
    sb.from('allowed_users').select('email, person, naam, functie, role, rechten, meldingen').neq('role', 'client').then(({ data, error }) => {
      if (error || !data || stop) return
      const team: Person[] = (data as { email: string; person: string | null; naam: string | null; functie: string | null; role: string; rechten: Rechten | null; meldingen: Partial<Record<Melding, boolean>> | null }[])
        .filter((r) => r.person)
        .map((r, i) => {
          const vast = TEAM_VAST[r.person!] ?? {}
          const naam = r.naam || r.person!
          return {
            id: r.person!,
            name: naam,
            role: r.functie || vast.role || (r.role === 'admin' ? 'Beheerder' : 'Medewerker'),
            initials: vast.initials || naam.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
            color: vast.color || KLEUREN[i % KLEUREN.length],
            photo: vast.photo,
            niveau: (r.role === 'admin' ? 'admin' : r.role === 'uit' ? 'uit' : 'medewerker') as Niveau,
            rechten: r.rechten ?? {},
            meldingen: r.meldingen ?? {},
            email: r.email,
          }
        })
      if (team.length) d({ type: 'team', team })
    })

    // Wijzigingen van de ander live binnenhalen
    const channel = sb.channel('rise-data')
    for (const t of TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => {
        if (p.eventType === 'DELETE') {
          const id = (p.old as { id?: string })?.id
          if (id && prev.current[t].has(id)) {
            prev.current[t].delete(id)
            d({ type: 'remote:weg', table: t, id })
          }
          return
        }
        const row = p.new as { data?: Rij; updated_by?: string }
        if (!row?.data || row.updated_by === userId) return
        remote.current.add(row.data)
        prev.current[t].set(row.data.id, row.data)
        d({ type: 'remote', table: t, obj: row.data })
      })
    }
    channel.subscribe()
    return () => {
      stop = true
      sb.removeChannel(channel)
    }
  }, [live, userId])

  // Live: elke gewijzigde rij opslaan
  useEffect(() => {
    if (!live || !supabase || !s.ready) return
    for (const t of TABLES) {
      const changed = (s[t] as { id: string }[]).filter((x) => prev.current[t].get(x.id) !== x && !remote.current.has(x))
      const nu = new Set((s[t] as { id: string }[]).map((x) => x.id))
      const weg = [...prev.current[t].keys()].filter((id) => !nu.has(id))
      prev.current[t] = new Map((s[t] as { id: string }[]).map((x) => [x.id, x]))
      if (weg.length) {
        supabase.from(t).delete().in('id', weg).then(({ error }) => {
          if (error) return console.error(`Verwijderen uit ${t} mislukt`, error)
          if (t === 'tasks') agendaSync([], weg)
        })
      }
      if (changed.length) {
        supabase
          .from(t)
          .upsert(changed.map((x) => ({ id: x.id, data: x, updated_at: new Date().toISOString(), updated_by: userId })))
          .then(({ error }) => {
            if (error) return console.error(`Opslaan in ${t} mislukt`, error)
            if (t === 'tasks') naarAgenda(changed.map((x) => x.id))
          })
      }
    }
  }, [live, userId, s.ready, s.tasks, s.contacts, s.clients, s.projects])

  // Lokaal: voorstel-reminders uit de mails in de tijdlijn. Live pas zodra de mail-sync er is.
  useEffect(() => {
    if (live) return
    for (const task of proposalReminders(s.contacts, s.tasks)) d({ type: 'task:upsert', task })
  }, [live, s.contacts, s.tasks])

  useEffect(() => {
    try {
      if (live) {
        localStorage.setItem(NOTION_KEY, s.notionUrl)
        localStorage.setItem('rise-dashboard-lang', s.lang)
      }
      else localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // localStorage vol (bijv. door grote screenshots)
    }
  }, [live, s])

  // TEAM gelijk houden met het live team (Avatar, personName en keuzelijsten lezen TEAM)
  if (TEAM !== s.team) TEAM.splice(0, TEAM.length, ...s.team)
  // Vertrouwelijke taken: live houdt de database ze al tegen; lokaal (en voor de zekerheid) ook hier
  const zicht = mag(s, 'vertrouwelijk') && mag(s, 'taken_alle') ? s : { ...s, tasks: s.tasks.filter((t) => (mag(s, 'vertrouwelijk') || !t.vertrouwelijk) && (mag(s, 'taken_alle') || t.assignee === s.me)) }
  return <Ctx.Provider value={{ s: zicht, d }}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore buiten StoreProvider')
  return v
}

export const uid = () => Math.random().toString(36).slice(2, 10)

const nu = () => new Date().toISOString()

/** "Start ermee": taak naar Bezig, voorgestelde deeltaken gelden als bevestigd. */
export function startTask(t: Task, subtasks: Subtask[]): Task {
  const now = nu()
  return { ...t, status: 'bezig', startedAt: t.startedAt ?? now, updatedAt: now, subtasks: verdeelDeadlines(subtasks, t.deadline), subtasksConfirmed: true }
}

/** Deeltaak afvinken. Eerste vinkje zet de taak op Bezig, laatste vinkje op Klaar. */
export function toggleSubtask(t: Task, id: string, me: PersonId): Task {
  const now = nu()
  const subtasks = (t.subtasks ?? []).map((st) => (st.id === id ? (st.done ? { ...st, done: false, doneAt: undefined, doneBy: undefined } : { ...st, done: true, doneAt: now, doneBy: me }) : st))
  const all = subtasks.length > 0 && subtasks.every((st) => st.done)
  const any = subtasks.some((st) => st.done)
  const status = all ? 'klaar' : any && (t.status === 'todo' || t.status === 'klaar') ? 'bezig' : t.status
  return { ...t, subtasks, subtasksConfirmed: true, status, startedAt: t.startedAt ?? (any ? now : undefined), updatedAt: now }
}

export const progress = (t: Task) => {
  const subs = t.subtasks && t.subtasksConfirmed ? t.subtasks : []
  return { done: subs.filter((x) => x.done).length, total: subs.length, next: subs.find((x) => !x.done) }
}

/** Niveau van een teamlid (onbekend = medewerker). */
export const niveauVan = (s: { team: Person[] }, id: PersonId): Niveau => s.team.find((p) => p.id === id)?.niveau ?? 'medewerker'

/** Mag de ingelogde persoon dit? Beheerders altijd; medewerkers alleen met het vinkje. */
export function mag(s: { team: Person[]; me: PersonId }, recht: Recht): boolean {
  const p = s.team.find((x) => x.id === s.me)
  if (!p || p.niveau === 'uit') return false
  if (p.niveau === 'admin') return true
  return p.rechten?.[recht] ?? RECHTEN.find((r) => r.key === recht)?.standaard ?? false
}

/** Hook: const kan = useMag(); kan('geld') */
export function useMag() {
  const { s } = useStore()
  return (recht: Recht) => mag(s, recht)
}

/** Is de ingelogde persoon beheerder? */
export function useBeheerder() {
  const { s } = useStore()
  return niveauVan(s, s.me) === 'admin'
}
