import { useState } from 'react'
import { TaskDrawer, newTask } from '../components/TaskDrawer'
import { VoorSelect, voorVan } from '../components/VoorSelect'
import { Icon, LeegStaat, PageHead, PriorityBadge, STATUS_LABEL, Segmented, StatusBadge, TaakWie } from '../components/ui'
import { SOORTEN, TEAM } from '../data/mock'
import type { PersonId, Task, TaskStatus } from '../data/types'
import { isStil, suggestSubtasks } from '../rules'
import { progress, startTask, uid, useStore } from '../store'
import { AGENDA_URL, daysUntil, deadlineLabel, opTodo, teLaat, standaardAfVoor } from '../utils'

const PRIO_ORDER = { hoog: 0, middel: 1, laag: 2 }

/** Vaste kleur per soort, zodat je hem in één oogopslag herkent. */
const SOORT_KLEUR: Record<string, string> = { Urgent: 'rood', 'Door klant': 'blauw', Sales: 'oranje', 'Directe omzet': 'groen', Klantwerk: 'blauw', 'Business improvement': 'paars', 'Geld besparen': 'geel', Systemen: 'grijs' }

export function TaskRow({ t, onOpen, showClient = true }: { t: Task; onOpen: () => void; showClient?: boolean }) {
  const { s, d } = useStore()
  const client = s.clients.find((c) => c.id === t.clientId)
  const contact = s.contacts.find((c) => c.id === t.contactId)
  const project = s.projects.find((x) => x.id === t.projectId)
  const p = progress(t)
  const late = teLaat(t.deadline) && t.status !== 'klaar'
  return (
    <tr className={`task-row ${t.status === 'klaar' ? 'done' : ''}`} onClick={onOpen}>
      <td className="task-title">
        {t.auto && <span className="badge auto" title="Automatisch aangemaakt: voorstel zonder reactie">Auto</span>}
        {t.title}
        {t.comments.length > 0 && (
          <span className="muted small comment-count"><Icon name="chat" size={13} /> {t.comments.length}</span>
        )}
        {isStil(t) && <span className="badge prio-hoog stil">Geen update</span>}
        {p.total > 0 && (
          <div className="row-progress">
            <span className="mini-bar"><i style={{ width: `${(p.done / p.total) * 100}%` }} /></span>
            <span className="muted small">{p.done}/{p.total}{p.next && t.status !== 'klaar' ? ` · nu: ${p.next.title}` : ''}</span>
          </div>
        )}
        {t.subtasks && !t.subtasksConfirmed && t.status !== 'klaar' && <div className="muted small row-progress">Deeltaken wachten op bevestiging</div>}
      </td>
      {showClient && <td className="muted">{client?.name ?? contact?.company ?? (project ? `Project: ${project.name}` : '—')}</td>}
      <td><PriorityBadge p={t.priority} /></td>
      <td className={late ? 'late' : ''}>{deadlineLabel(t.deadline, t.status === 'klaar')}</td>
      <td><TaakWie t={t} /></td>
      <td>
        {t.status === 'todo' ? (
          <button className="btn small start" title="Start ermee" onClick={(e) => { e.stopPropagation(); d({ type: 'task:upsert', task: startTask(t, t.subtasks?.length ? t.subtasks : suggestSubtasks(t.title, client?.name ?? contact?.company).map((title) => ({ id: uid(), title, done: false }))) }) }}>
            <Icon name="play" size={12} /> Start
          </button>
        ) : (
          <StatusBadge s={t.status} />
        )}
      </td>
    </tr>
  )
}

export function TaskTable({ tasks, onOpen, showClient = true }: { tasks: Task[]; onOpen: (t: Task) => void; showClient?: boolean }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Taak</th>
          {showClient && <th>Klant / contact</th>}
          <th>Prioriteit</th>
          <th>Deadline</th>
          <th>Wie</th>
          <th>Fase</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <TaskRow key={t.id} t={t} onOpen={() => onOpen(t)} showClient={showClient} />
        ))}
        {tasks.length === 0 && (
          <tr><td colSpan={7} className="empty"><LeegStaat icon="tasks" titel="Geen open taken" tekst="Alles is weggewerkt, of er staat nog niets klaar." /></td></tr>
        )}
      </tbody>
    </table>
  )
}

/** Taak toevoegen in één regel: titel typen, Enter. Voor wie, wie en deadline staan al goed. */
export function SnelleTaak({ clientId, projectId, voor: voorStart, onAdded }: { clientId?: string; projectId?: string; voor?: string; onAdded?: (t: Task) => void }) {
  const { s, d } = useStore()
  const [title, setTitle] = useState('')
  const [voor, setVoor] = useState(voorStart ?? '')
  const [voorFout, setVoorFout] = useState(false)
  const add = () => {
    if (!title.trim()) return
    const keuze = clientId ?? (projectId ? `p.${projectId}` : voor)
    if (!keuze) return setVoorFout(true)
    const pid = keuze.startsWith('p.') ? keuze.slice(2) : undefined
    const cid = keuze.startsWith('c.') ? keuze.slice(2) : undefined
    const project = pid ? s.projects.find((x) => x.id === pid) : undefined
    const productie = project?.soort === 'productie'
    const c = s.clients.find((x) => x.id === (productie ? project?.clientId : pid || cid ? undefined : keuze))
    // Intern project, vanuit het project zelf: eerst op de projectlijst, zonder deadline. Productie: altijd meteen op de to-do lijst.
    const task = projectId && !productie
      ? newTask({ title: title.trim(), projectId, inTodo: false, soort: 'Business improvement', deadline: '' }, s.me)
      : pid
        ? newTask({ title: title.trim(), projectId: pid, clientId: c?.id, contactId: c?.contactId, inTodo: true, soort: productie ? 'Klantwerk' : 'Business improvement', deadline: standaardAfVoor() }, s.me)
        : cid
          ? newTask({ title: title.trim(), contactId: cid, soort: 'Sales', deadline: standaardAfVoor() }, s.me)
          : newTask({ title: title.trim(), clientId: c?.id, contactId: c?.contactId, soort: 'Klantwerk', deadline: standaardAfVoor() }, s.me)
    setVoorFout(false)
    d({ type: 'task:upsert', task })
    setTitle('')
    onAdded?.(task)
  }
  return (
    <div className="quick-add card">
      <Icon name="plus" size={16} />
      <input placeholder="Nieuwe taak… typ en druk op Enter" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      {!clientId && !projectId && <VoorSelect value={voor} onChange={(v) => { setVoor(v); setVoorFout(false) }} />}
      <span className={`small ${voorFout ? 'danger-tekst' : 'muted'}`}>{voorFout ? 'Kies eerst voor welke klant of welk project' : projectId && s.projects.find((x) => x.id === projectId)?.soort !== 'productie' ? 'op de projectlijst' : 'voor jou · over 3 werkdagen'}</span>
    </div>
  )
}

export function Taken({ klant: klantRoute, go }: { klant?: string; go?: (r: string) => void }) {
  const { s, d } = useStore()
  const [who, setWho] = useState<PersonId | 'all'>('all')
  const [view, setViewState] = useState<'lijst' | 'bord'>(() => (localStorage.getItem('rise-taken-weergave') as 'lijst' | 'bord') || 'bord')
  const setView = (v: 'lijst' | 'bord') => { setViewState(v); localStorage.setItem('rise-taken-weergave', v) }
  const klant = klantRoute ?? 'all'
  const setKlant = (k: string) => go?.(k === 'all' ? 'taken' : `taken/${k}`)
  const [showDone, setShowDone] = useState(false)
  const [openTaak, setOpen] = useState<Task | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [soort, setSoort] = useState<string>('all')

  const isUrgent = (t: Task) => t.status !== 'klaar' && t.priority === 'hoog' && daysUntil(t.deadline) <= 1
  const voorFilter = klant === 'intern' ? '' : klant
  const mineOrAll = s.tasks
    .filter(opTodo)
    .filter((t) => who === 'all' || t.assignee === who)
    .filter((t) => klant === 'all' || voorVan(t, s.clients) === voorFilter)
  const tasks = mineOrAll
    .filter((t) => soort === 'all' || (soort === 'Urgent' ? isUrgent(t) : soort === 'Door klant' ? Boolean(t.doorKlant) : t.soort === soort))
    .filter((t) => showDone || view === 'bord' || t.status !== 'klaar')
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority])

  const move = (id: string, status: TaskStatus) => {
    const t = s.tasks.find((x) => x.id === id)
    if (t && t.status !== status) d({ type: 'task:upsert', task: { ...t, status } })
  }

  return (
    <>
      <PageHead title="Taken" sub={`${s.tasks.filter((t) => opTodo(t) && t.status !== 'klaar').length} open · opleverdata van video's staan als hele dag in de Rise-agenda`}>
        <a className="btn" href={AGENDA_URL} target="_blank" rel="noreferrer"><Icon name="calendar" size={16} /> Rise-agenda</a>
        <button className="btn primary" onClick={() => setOpen(newTask({}, s.me))}><Icon name="plus" size={16} /> Nieuwe taak</button>
      </PageHead>

      <SnelleTaak key={klant} voor={klant !== 'all' && klant !== 'intern' ? klant : ''} />

      <div className="card taken-filters">
        {klant !== 'all' && (
          <div className="filter-rij">
            <span className="filter-label">Voor</span>
            <div className="chips"><button className="chip on" onClick={() => setKlant('all')}>{klant === 'intern' ? 'Overig' : klant.startsWith('p.') ? s.projects.find((p) => `p.${p.id}` === klant)?.name : s.clients.find((c) => c.id === klant)?.name} <Icon name="x" size={12} /></button></div>
          </div>
        )}
        <div className="filter-rij">
          <span className="filter-label">Soort</span>
          <div className="chips">
            <button className={`chip ${soort === 'all' ? 'on' : ''}`} onClick={() => setSoort('all')}>Alles <span className="aantal">{mineOrAll.filter((t) => t.status !== 'klaar').length}</span></button>
            {['Urgent', 'Door klant', ...SOORTEN].map((x) => {
              const n = mineOrAll.filter((t) => (x === 'Urgent' ? isUrgent(t) : x === 'Door klant' ? t.doorKlant && t.status !== 'klaar' : t.soort === x && t.status !== 'klaar')).length
              if (x === 'Door klant' && n === 0 && soort !== x) return null
              return (
                <button key={x} className={`chip soort-chip ${x === 'Urgent' ? 'urgent' : ''} ${soort === x ? 'on' : ''} ${n === 0 && soort !== x ? 'leeg' : ''}`} onClick={() => setSoort(soort === x ? 'all' : x)}>
                  <i className={`stip stip-${SOORT_KLEUR[x] ?? 'grijs'}`} />{x} <span className="aantal">{n}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="filter-rij">
          <span className="filter-label">Wie</span>
          <Segmented value={who} onChange={setWho} options={[{ value: 'all', label: 'Iedereen' }, ...TEAM.map((t) => ({ value: t.id, label: t.name }))]} />
          <span className="filter-rechts">
            {view === 'lijst' && (
              <label className="check-row inline small">
                <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Afgeronde tonen
              </label>
            )}
            <Segmented value={view} onChange={setView} options={[{ value: 'lijst', label: <><Icon name="list" size={15} /> Lijst</> }, { value: 'bord', label: <><Icon name="board" size={15} /> Bord</> }]} />
          </span>
        </div>
      </div>

      {view === 'lijst' ? (
        <div className="card flush"><TaskTable tasks={tasks} onOpen={setOpen} /></div>
      ) : (
        <div className="board">
          {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((st) => {
            const col = tasks.filter((t) => t.status === st)
            return (
              <div key={st} className={`board-col ${drag ? 'droppable' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) move(drag, st); setDrag(null) }}>
                <div className="board-col-head">
                  <span>{STATUS_LABEL[st]}</span>
                  <span className="count">{col.length}</span>
                </div>
                {col.map((t) => {
                  const client = s.clients.find((c) => c.id === t.clientId)
                  const project = s.projects.find((p) => p.id === t.projectId)
                  return (
                    <div key={t.id} className="board-card" draggable onDragStart={() => setDrag(t.id)} onDragEnd={() => setDrag(null)} onClick={() => setOpen(t)}>
                      <div className="board-card-title">{t.title}</div>
                      {(client || project) && <div className="muted small">{client ? client.name : `Rise · ${project!.name}`}</div>}
                      {progress(t).total > 0 && (
                        <div className="row-progress">
                          <span className="mini-bar"><i style={{ width: `${(progress(t).done / progress(t).total) * 100}%` }} /></span>
                          <span className="muted small">{progress(t).done}/{progress(t).total}</span>
                        </div>
                      )}
                      {isStil(t) && <span className="badge prio-hoog stil">Geen update</span>}
                      <div className="board-card-foot">
                        <PriorityBadge p={t.priority} />
                        <span className={`small ${teLaat(t.deadline) && t.status !== 'klaar' ? 'late' : 'muted'}`}>{deadlineLabel(t.deadline, t.status === 'klaar')}</span>
                        <TaakWie t={t} size={22} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {openTaak && <TaskDrawer key={openTaak.id} task={openTaak} onClose={() => setOpen(null)} />}
    </>
  )
}
