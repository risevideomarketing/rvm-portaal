import { useState } from 'react'
import { TaskDrawer } from '../components/TaskDrawer'
import { Avatar, Icon, PageHead, Segmented } from '../components/ui'
import type { PersonId, Task } from '../data/types'
import { useStore } from '../store'
import { AGENDA_URL, DEADLINE_UUR, deadlineDag, opTodo, teLaat } from '../utils'

const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
const DAGEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

interface Item { key: string; dag: string; titel: string; sub?: string; task?: Task; deeltaak: boolean; klaar: boolean; content?: { clientId: string; itemId: string; kanaal: string; tijd?: string } }

/**
 * Planning: dezelfde taken als in Taken, als agenda (maand) of tijdlijn (week). Niets apart bijhouden:
 * een taak staat op de dag van de echte deadline (de dag vóór "af vóór", 18:00), deeltaken op hun eigen dag.
 */
export function Planning({ go }: { go: (r: string) => void }) {
  const { s } = useStore()
  const [weergave, setWeergave] = useState<'maand' | 'week'>(() => (localStorage.getItem('rise-planning-weergave') as 'maand' | 'week') || 'maand')
  const [anker, setAnker] = useState(() => new Date())
  const [wie, setWie] = useState<PersonId | 'all'>('all')
  const [deeltaken, setDeeltaken] = useState(true)
  const [content, setContent] = useState(true)
  const [open, setOpen] = useState<Task | null>(null)
  const zet = (w: 'maand' | 'week') => { setWeergave(w); localStorage.setItem('rise-planning-weergave', w) }

  const naamVan = (t: Task) => {
    const p = s.projects.find((x) => x.id === t.projectId)
    const k = s.clients.find((c) => c.id === t.clientId)?.name ?? s.contacts.find((c) => c.id === t.contactId)?.company
    return [k, p?.name].filter(Boolean).join(' · ')
  }

  const items: Item[] = []
  for (const t of s.tasks) {
    if (!opTodo(t) && !t.deadline) continue
    if (wie !== 'all' && t.assignee !== wie) continue
    if (t.deadline) items.push({ key: t.id, dag: deadlineDag(t.deadline), titel: t.title, sub: naamVan(t), task: t, deeltaak: false, klaar: t.status === 'klaar' })
    if (deeltaken) for (const st of t.subtasks ?? []) {
      if (st.deadline && t.subtasksConfirmed !== false) items.push({ key: `${t.id}-${st.id}`, dag: deadlineDag(st.deadline), titel: st.title, sub: t.title, task: t, deeltaak: true, klaar: st.done || t.status === 'klaar' })
    }
  }
  // Contentkalender: geplande mails en posts (los van taken; wie-filter geldt niet)
  if (content) for (const c of s.clients) for (const i of c.contentKalender ?? []) {
    if (!i.datum || !(c.kanalen ?? []).includes(i.kanaal)) continue
    items.push({ key: `c-${c.id}-${i.id}`, dag: i.datum, titel: `${i.kanaal}: ${i.titel}`, sub: c.name, deeltaak: false, klaar: i.status === 'klaar', content: { clientId: c.id, itemId: i.id, kanaal: i.kanaal, tijd: i.tijd } })
  }
  const opDag = (dag: string) => items.filter((i) => i.dag === dag).sort((a, b) => Number(Boolean(b.content)) - Number(Boolean(a.content)) || Number(a.deeltaak) - Number(b.deeltaak) || Number(a.klaar) - Number(b.klaar))

  // Dagen in beeld
  const start = new Date(anker)
  start.setHours(12, 0, 0, 0)
  let dagen: Date[]
  if (weergave === 'maand') {
    const eerste = new Date(start.getFullYear(), start.getMonth(), 1, 12)
    const offset = (eerste.getDay() + 6) % 7
    eerste.setDate(eerste.getDate() - offset)
    const aantal = Math.ceil((offset + new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()) / 7) * 7
    dagen = Array.from({ length: aantal }, (_, i) => { const x = new Date(eerste); x.setDate(x.getDate() + i); return x })
  } else {
    const ma = new Date(start)
    ma.setDate(ma.getDate() - ((ma.getDay() + 6) % 7))
    dagen = Array.from({ length: 7 }, (_, i) => { const x = new Date(ma); x.setDate(x.getDate() + i); return x })
  }
  const verschuif = (n: number) => {
    const x = new Date(anker)
    if (weergave === 'maand') x.setMonth(x.getMonth() + n, 1)
    else x.setDate(x.getDate() + 7 * n)
    setAnker(x)
  }
  const vandaag = iso(new Date())
  const titelRuw = weergave === 'maand'
    ? anker.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
    : `Week van ${dagen[0].toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`
  const titel = titelRuw.charAt(0).toUpperCase() + titelRuw.slice(1)

  const Regel = ({ i }: { i: Item }) => {
    if (i.content) {
      const c = i.content
      return (
        <button className={`plan-item contentmoment ${i.klaar ? 'gereed' : ''}`} onClick={() => go(`klanten/${c.clientId}/content/${c.itemId}`)} title={`${i.titel} · ${i.sub}${c.tijd ? ` · ${c.tijd}` : ''}`}>
          <span className="plan-titel">{c.tijd ? `${c.tijd} ` : ''}{i.titel}</span>
          {weergave === 'week' && i.sub && <span className="plan-sub">{i.sub}{i.klaar ? ' · klaar voor verzending' : ''}</span>}
        </button>
      )
    }
    const t = i.task!
    const laat = !i.klaar && !i.deeltaak && teLaat(t.deadline)
    return (
      <button className={`plan-item ${i.deeltaak ? 'deel' : ''} ${i.klaar ? 'klaar' : ''} ${laat ? 'late' : ''} prio-${t.priority}`} onClick={() => setOpen(t)} title={`${i.titel}${i.sub ? ` · ${i.sub}` : ''}`}>
        <span className="plan-titel">{i.titel}</span>
        {weergave === 'week' && i.sub && <span className="plan-sub">{i.sub}</span>}
      </button>
    )
  }

  return (
    <>
      <PageHead title="Planning" sub={<>Dezelfde taken als in Taken, op de dag van de deadline ({DEADLINE_UUR}:00). Staan ook in de <a href={AGENDA_URL} target="_blank" rel="noreferrer">Rise-agenda</a>.</>}>
        <Segmented value={weergave} onChange={zet} options={[{ value: 'maand', label: 'Maand' }, { value: 'week', label: 'Week' }]} />
        <button className="btn primary" onClick={() => go('taken')}><Icon name="tasks" size={16} /> Naar Taken</button>
      </PageHead>

      <div className="card filter-balk">
        <button className="btn small" onClick={() => verschuif(-1)} aria-label="Vorige">‹</button>
        <button className="btn small" onClick={() => setAnker(new Date())}>Vandaag</button>
        <button className="btn small" onClick={() => verschuif(1)} aria-label="Volgende">›</button>
        <strong className="plan-kop">{titel}</strong>
        <span className="filter-rechts">
          <label className="small muted"><input type="checkbox" checked={deeltaken} onChange={(e) => setDeeltaken(e.target.checked)} /> Deeltaken</label>
          <label className="small muted plan-content-filter"><input type="checkbox" checked={content} onChange={(e) => setContent(e.target.checked)} /> <i className="plan-stip contentmoment" /> Content</label>
          <button className={`chip ${wie === 'all' ? 'on' : ''}`} onClick={() => setWie('all')}>Iedereen</button>
          {s.team.filter((p) => p.niveau !== 'uit').map((p) => (
            <button key={p.id} className={`chip ${wie === p.id ? 'on' : ''}`} onClick={() => setWie(p.id)}><Avatar id={p.id} size={16} /> {p.name.split(' ')[0]}</button>
          ))}
        </span>
      </div>

      {weergave === 'maand' ? (
        <div className="card flush plan-maand">
          {DAGEN.map((d) => <div key={d} className="plan-dagkop">{d}</div>)}
          {dagen.map((x) => {
            const dag = iso(x)
            const lijst = opDag(dag)
            return (
              <div key={dag} className={`plan-cel ${x.getMonth() !== anker.getMonth() ? 'buiten' : ''} ${dag === vandaag ? 'vandaag' : ''} ${x.getDay() === 0 || x.getDay() === 6 ? 'weekend' : ''}`}
                onClick={() => { if (window.matchMedia('(max-width: 760px)').matches) { setAnker(x); zet('week') } }}>
                <span className="plan-datum">{x.getDate()}</span>
                {lijst.slice(0, 4).map((i) => <Regel key={i.key} i={i} />)}
                {lijst.length > 0 && <span className="plan-aantal">{lijst.length}</span>}
                {lijst.length > 4 && <button className="link small" onClick={() => { setAnker(x); zet('week') }}>+{lijst.length - 4} meer</button>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="plan-week">
          {dagen.map((x) => {
            const dag = iso(x)
            const lijst = opDag(dag)
            return (
              <div key={dag} className={`card plan-weekdag ${dag === vandaag ? 'vandaag' : ''}`}>
                <div className="plan-weekkop"><strong>{x.toLocaleDateString('nl-NL', { weekday: 'long' })}</strong> <span className="muted small">{x.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span></div>
                {lijst.length === 0 && <span className="muted small">Niets gepland</span>}
                {lijst.map((i) => <Regel key={i.key} i={i} />)}
              </div>
            )
          })}
        </div>
      )}
      {open && <TaskDrawer key={open.id} task={open} onClose={() => setOpen(null)} />}
    </>
  )
}
