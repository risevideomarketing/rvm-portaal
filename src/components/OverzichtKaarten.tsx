// Overzicht: to-do's (snel toevoegen en afvinken, per soort) en de agenda (Google Agenda + deadlines) van deze week.
import { useEffect, useState } from 'react'
import { SOORTEN } from '../data/mock'
import type { Soort, Task } from '../data/types'
import { type Afspraak, mijnAgenda } from '../slack'
import { uid, useStore } from '../store'
import { AGENDA_URL, opTodo, standaardAfVoor, teLaat } from '../utils'
import { Icon } from './ui'

const vandaag = () => new Date().toISOString().slice(0, 10)
const dagKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function TodoKaart({ onOpen, go }: { onOpen: (t: Task) => void; go: (r: string) => void }) {
  const { s, d } = useStore()
  const [titel, setTitel] = useState('')
  const [soort, setSoort] = useState<Soort>('Klantwerk')
  const mijn = s.tasks.filter((t) => opTodo(t) && t.assignee === s.me && (t.status !== 'klaar' || (t.updatedAt ?? '').slice(0, 10) === vandaag()))
  const groepen = SOORTEN.map((x) => ({ soort: x, taken: mijn.filter((t) => t.soort === x).sort((a, b) => Number(a.status === 'klaar') - Number(b.status === 'klaar') || a.deadline.localeCompare(b.deadline)) })).filter((g) => g.taken.length)
  const toevoegen = () => {
    const t = titel.trim()
    if (!t) return
    d({ type: 'task:upsert', task: { id: uid(), title: t, priority: 'middel', soort, deadline: standaardAfVoor(), assignee: s.me, status: 'todo', inAgenda: false, comments: [], updatedAt: new Date().toISOString() } })
    setTitel('')
  }
  const vink = (t: Task) => d({ type: 'task:upsert', task: { ...t, status: t.status === 'klaar' ? 'todo' : 'klaar', updatedAt: new Date().toISOString() } })
  return (
    <div className="card ov-todo">
      <div className="card-head">
        <h3 className="section-title"><Icon name="tasks" size={16} /> To-do's</h3>
        <button className="link" onClick={() => go('taken')}>Alle taken →</button>
      </div>
      <form className="ov-add" onSubmit={(e) => { e.preventDefault(); toevoegen() }}>
        <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Nieuwe to-do, enter om toe te voegen" aria-label="Nieuwe to-do" />
        <select value={soort} onChange={(e) => setSoort(e.target.value as Soort)} aria-label="Soort">{SOORTEN.map((x) => <option key={x}>{x}</option>)}</select>
        <button className="btn small primary" type="submit" aria-label="Toevoegen"><Icon name="plus" size={14} /></button>
      </form>
      {groepen.length === 0 ? <p className="muted small">Alles af. Lekker.</p> : groepen.map((g) => (
        <div key={g.soort} className="ov-groep">
          <div className="ov-groep-kop">{g.soort} <span className="muted">{g.taken.filter((t) => t.status !== 'klaar').length}</span></div>
          <ul className="ov-taken">
            {g.taken.map((t) => (
              <li key={t.id} className={t.status === 'klaar' ? 'af' : ''}>
                <button className={`sk-vink ${t.status === 'klaar' ? 'aan' : ''}`} aria-label={t.status === 'klaar' ? 'Weer open' : 'Afvinken'} onClick={() => vink(t)}>{t.status === 'klaar' && <Icon name="check" size={12} />}</button>
                <span className="list-main" onClick={() => onOpen(t)}>{t.title}</span>
                {t.status !== 'klaar' && teLaat(t.deadline) && <span className="badge ov-laat">Te laat</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function AgendaKaart({ onOpen }: { onOpen: (t: Task) => void }) {
  const { s } = useStore()
  const [afspraken, setAfspraken] = useState<Afspraak[] | null>(null)
  const [gekoppeld, setGekoppeld] = useState(true)
  useEffect(() => {
    let stop = false
    const laad = () => mijnAgenda().then((r) => {
      if (stop) return
      if ('fout' in r && !('afspraken' in r)) { setGekoppeld(false); setAfspraken([]); return }
      const x = r as { gekoppeld: boolean; afspraken: Afspraak[] }
      setGekoppeld(x.gekoppeld); setAfspraken(x.afspraken)
    })
    laad()
    const t = setInterval(laad, 5 * 60_000)
    return () => { stop = true; clearInterval(t) }
  }, [])
  const dagen = Array.from({ length: 7 }, (_, i) => { const x = new Date(); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + i); return x })
  const deadlines = s.tasks.filter((t) => opTodo(t) && t.status !== 'klaar' && t.assignee === s.me && t.inAgenda)
  const rijen = dagen.map((dag, i) => {
    const k = dagKey(dag)
    const items = (afspraken ?? []).filter((a) => (a.heleDag ? a.start <= k && a.eind > k : dagKey(new Date(a.start)) === k))
    const taken = deadlines.filter((t) => t.deadline === k || (i === 0 && teLaat(t.deadline)))
    return { dag, k, i, items, taken }
  }).filter((r) => r.i === 0 || r.items.length || r.taken.length)
  const tijd = (iso: string) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="card ov-agenda">
      <div className="card-head">
        <h3 className="section-title"><Icon name="calendar" size={16} /> Agenda</h3>
        <a className="link" href={AGENDA_URL} target="_blank" rel="noreferrer">Google Agenda →</a>
      </div>
      {!gekoppeld && <p className="muted small">Google Agenda is nog niet gekoppeld. Je ziet hier nu alleen je deadlines.</p>}
      {afspraken === null && gekoppeld && <p className="muted small">Agenda laden…</p>}
      {rijen.map((r) => (
        <div key={r.k} className="ov-dag">
          <div className="ov-dag-kop">{r.i === 0 ? 'Vandaag' : r.i === 1 ? 'Morgen' : r.dag.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' })}</div>
          {r.items.length === 0 && r.taken.length === 0 && <p className="muted small" style={{ margin: '2px 0 0' }}>Niks gepland.</p>}
          <ul className="ov-items">
            {r.items.map((a) => (
              <li key={a.id}>
                <span className="ov-tijd">{a.heleDag ? 'Hele dag' : tijd(a.start)}</span>
                {a.link ? <a className="list-main" href={a.link} target="_blank" rel="noreferrer">{a.titel}</a> : <span className="list-main">{a.titel}</span>}
                {a.agenda && <span className="muted small ov-agnaam">{a.agenda}</span>}
              </li>
            ))}
            {r.taken.map((t) => (
              <li key={t.id} className="ov-deadline" onClick={() => onOpen(t)}>
                <span className={`ov-tijd ${teLaat(t.deadline) ? 'late' : ''}`}>{teLaat(t.deadline) ? 'Te laat' : 'Deadline'}</span>
                <span className="list-main">{t.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
