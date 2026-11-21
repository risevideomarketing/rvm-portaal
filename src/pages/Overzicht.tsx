import { useEffect, useState, type ReactNode } from 'react'
import { Progress } from '../components/charts'
import { TaskDrawer } from '../components/TaskDrawer'
import { AgendaKaart, TodoKaart } from '../components/OverzichtKaarten'
import { Avatar, Icon, Kpi, LeegStaat, TaakWie, personName } from '../components/ui'
import { STAGES, faseVan, fasenVan, isKlant, pipelineItems } from '../data/mock'
import type { Task } from '../data/types'
import { useMag, useStore } from '../store'
import { daysUntil, deadlineLabel, euro, opTodo, teLaat } from '../utils'

const PRIO = { hoog: 0, middel: 1, laag: 2 }

export function Overzicht({ go }: { go: (r: string) => void }) {
  const { s, d } = useStore()
  const kan = useMag()
  // Afgeronde taken per week, de laatste 8 weken (huidige week laatst)
  const afgerond = Array.from({ length: 8 }, (_, k) => {
    const eind = Date.now() - (7 - k) * 7 * 86_400_000
    return s.tasks.filter((t) => t.status === 'klaar' && t.updatedAt && new Date(t.updatedAt).getTime() <= eind && new Date(t.updatedAt).getTime() > eind - 7 * 86_400_000).length
  })
  const activiteit = recenteActiviteit(s, (t) => setOpen(t), go)
  const [open, setOpen] = useState<Task | null>(null)
  const openTasks = s.tasks.filter((t) => opTodo(t) && t.status !== 'klaar')
  const mine = openTasks.filter((t) => t.assignee === s.me)
  // Top 5: eerst wat te laat of vandaag is, dan prioriteit, dan deadline
  const top = [...mine]
    .sort((a, b) => Math.min(daysUntil(a.deadline), 1) - Math.min(daysUntil(b.deadline), 1) || PRIO[a.priority] - PRIO[b.priority] || a.deadline.localeCompare(b.deadline))
    .slice(0, 5)
  const doneToday = s.tasks.filter((t) => t.assignee === s.me && t.status === 'klaar' && daysUntil(t.deadline) >= -1).length
  const focus = top[0]
  const late = openTasks.filter((t) => teLaat(t.deadline)).length
  const reminders = openTasks.filter((t) => t.auto)
  const nu = useNu()
  const groet = nu.getHours() < 6 ? 'Goedenacht' : nu.getHours() < 12 ? 'Goedemorgen' : nu.getHours() < 18 ? 'Goedemiddag' : 'Goedenavond'
  const nameOf = (t: Task) => s.clients.find((c) => c.id === t.clientId)?.name ?? s.contacts.find((c) => c.id === t.contactId)?.company ?? ''
  const toggle = (t: Task) => d({ type: 'task:upsert', task: { ...t, status: t.status === 'klaar' ? 'todo' : 'klaar' } })

  const zin = [
    `${mine.length} open taken voor jou`,
    reminders.length ? `${reminders.length} ${reminders.length === 1 ? 'voorstel wacht' : 'voorstellen wachten'} al 5+ dagen op reactie` : null,
  ].filter(Boolean).join(', ')

  return (
    <>
      <div className="hero">
        <div className="hero-left">
          <div className="hero-date">{nu.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{groet}, {personName(s.me)}.</h1>
          <p className="hero-zin">{zin}.</p>
          {focus && (
            <div className="focus" onClick={() => setOpen(focus)}>
              <div className="focus-label">Focus van vandaag</div>
              <div className="focus-title">{focus.title}</div>
              <div className="focus-meta">{nameOf(focus)}{nameOf(focus) && ' · '}{deadlineLabel(focus.deadline)}</div>
            </div>
          )}
        </div>
        <div className="hero-right">
          <div className="top-head">
            <span>Top 5 voor vandaag</span>
            <span className="muted-light">{doneToday} klaar</span>
          </div>
          <ol className="top5">
            {top.map((t, i) => (
              <li key={t.id} className={i === 0 ? 'now' : ''}>
                <span className="top-n">{i + 1}</span>
                <button className="circle" aria-label="Afvinken" onClick={() => toggle(t)} />
                <span className="top-title" onClick={() => setOpen(t)}>{t.title}</span>
                {i === 0 && <span className="now-badge">NU</span>}
              </li>
            ))}
            {top.length === 0 && <li className="muted-light">Niets open. Lekker bezig.</li>}
          </ol>
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Klanten" value={String(s.contacts.filter((c) => isKlant(c.stage)).length)} hint={kan('geld') ? `${euro(s.contacts.filter((c) => isKlant(c.stage)).reduce((a, c) => a + c.value, 0))} aan opdrachten` : 'In de CRM'} />
        <Kpi label="Leads" value={String(s.contacts.filter((c) => c.stage === 'lead' || c.stage === 'gemaild').length)} hint="Lead en gemaild in de CRM" />
        <Kpi label="Voorstellen uit" value={kan('geld') ? euro(pipelineItems(s.contacts).filter((c) => c.stage === 'voorstel').reduce((a, c) => a + c.value, 0)) : String(pipelineItems(s.contacts).filter((c) => c.stage === 'voorstel').length)} hint={`${pipelineItems(s.contacts).filter((c) => c.stage === 'voorstel').length} voorstellen · ${reminders.length} zonder reactie`} />
        <Kpi label="Afgerond deze week" value={String(afgerond[afgerond.length - 1])} trend={afgerond} delta={afgerond[afgerond.length - 2] ? Math.round(((afgerond[afgerond.length - 1] - afgerond[afgerond.length - 2]) / afgerond[afgerond.length - 2]) * 100) : undefined} deltaTekst="t.o.v. vorige week" hint={`${openTasks.length} open · ${late} over de deadline`} />
      </div>

      <div className="two-col">
        <TodoKaart onOpen={setOpen} go={go} />
        <AgendaKaart onOpen={setOpen} />
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head">
            <h3 className="section-title">Pipeline</h3>
            <button className="link" onClick={() => go('crm')}>Naar CRM →</button>
          </div>
          <div className="funnel">
            {STAGES.map((st) => {
              const col = pipelineItems(s.contacts).filter((c) => c.stage === st.key)
              return (
                <div key={st.key} className="funnel-step">
                  <div className="funnel-n">{col.length}</div>
                  <div className="small">{st.label}</div>
                  {kan('geld') && <div className="muted small">{euro(col.reduce((a, c) => a + c.value, 0))}</div>}
                </div>
              )
            })}
          </div>
          {reminders.length > 0 && (
            <ul className="list reminders">
              {reminders.map((t) => (
                <li key={t.id} onClick={() => setOpen(t)}>
                  <span className="badge auto">Auto</span>
                  <span className="list-main">{t.title}</span>
                  <TaakWie t={t} size={22} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h3 className="section-title">Klanten</h3>
            <button className="link" onClick={() => go('klanten')}>Alle klanten →</button>
          </div>
          <ul className="list">
            {s.clients.map((c) => (
              <li key={c.id} onClick={() => go(`klanten/${c.id}`)}>
                <span className="list-main">{c.name}<span className="muted small">{faseVan(c).label}</span></span>
                <span className="list-progress"><Progress value={c.phase + 1} max={fasenVan(c).length} /></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="card ov-activiteit">
          <div className="card-head">
            <h3 className="section-title"><span className="live-dot" /> Recente activiteit</h3>
          </div>
          {activiteit.length === 0 ? (
            <LeegStaat icon="activity" titel="Nog geen activiteit" tekst="Zodra iemand een deeltaak afvinkt, een notitie zet of een klant iets doet in het portaal, zie je het hier." />
          ) : (
            <ul className="activiteit">
              {activiteit.map((a) => (
                <li key={a.key} onClick={a.open}>
                  {a.wie ? <Avatar id={a.wie} size={26} /> : <span className="activiteit-icoon"><Icon name={a.icon} size={14} /></span>}
                  <span className="list-main"><span>{a.tekst}</span><span className="muted small">{[a.waar, geleden(a.at)].filter(Boolean).join(' · ')}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>

      {open && <TaskDrawer key={open.id} task={open} onClose={() => setOpen(null)} />}
    </>
  )
}

/** "10 min geleden", "3 uur geleden", "gisteren", "12 nov". */
function geleden(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'zojuist'
  if (min < 60) return `${min} min geleden`
  if (min < 24 * 60) return `${Math.round(min / 60)} uur geleden`
  if (min < 48 * 60) return 'gisteren'
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

/** Wat er recent is gebeurd, uit de gegevens zelf: deeltaken, opmerkingen, CRM-notities, portaal (vragen, klanttaken, links). */
function recenteActiviteit(s: ReturnType<typeof useStore>['s'], openTaak: (t: Task) => void, go: (r: string) => void) {
  type A = { key: string; at: string; wie?: string; icon: string; tekst: ReactNode; waar?: string; open?: () => void }
  const uit: A[] = []
  const naamVoor = (t: Task) => s.clients.find((c) => c.id === t.clientId)?.name ?? s.contacts.find((c) => c.id === t.contactId)?.company
  for (const t of s.tasks) {
    for (const st of t.subtasks ?? []) if (st.done && st.doneAt) uit.push({ key: `st-${t.id}-${st.id}`, at: st.doneAt, wie: st.doneBy, icon: 'check', tekst: <>{st.doneBy ? personName(st.doneBy) : 'Iemand'} vinkte <strong>{st.title}</strong> af</>, waar: naamVoor(t), open: () => openTaak(t) })
    for (const c of t.comments) uit.push({ key: `c-${c.id}`, at: c.at, wie: c.author, icon: 'chat', tekst: <>{personName(c.author)} reageerde op <strong>{t.title}</strong></>, waar: naamVoor(t), open: () => openTaak(t) })
  }
  for (const c of s.contacts) for (const it of c.timeline.slice(0, 3)) if (it.author) uit.push({ key: `tl-${it.id}`, at: it.at, wie: it.author, icon: 'note', tekst: <>{personName(it.author)} zette een notitie bij <strong>{c.company}</strong></>, waar: 'CRM', open: () => go('crm') })
  for (const k of s.clients) {
    for (const v of k.hulpvragen ?? []) uit.push({ key: `v-${v.id}`, at: v.at, icon: 'chat', tekst: <><strong>{k.name}</strong> stelde een vraag in het portaal</>, open: () => go(`klanten/${k.id}`) })
    for (const kt of k.klantTaken ?? []) if (kt.done && kt.doneAt) uit.push({ key: `kt-${kt.id}`, at: kt.doneAt, icon: 'check', tekst: <><strong>{k.name}</strong> vinkte <strong>{kt.title}</strong> af</>, waar: 'portaal', open: () => go(`klanten/${k.id}`) })
    for (const p of k.contentPlekken ?? []) if (p.door === 'klant') uit.push({ key: `cp-${p.id}`, at: p.at, icon: 'image', tekst: <><strong>{k.name}</strong> zette een contentmap klaar</>, waar: p.title, open: () => go(`klanten/${k.id}`) })
  }
  return uit.filter((a) => a.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7)
}

/** De tijd van nu, elke minuut bijgewerkt (groet en datum kloppen ook als het tabblad de hele dag openstaat). */
function useNu() {
  const [nu, setNu] = useState(() => new Date())
  useEffect(() => {
    const i = window.setInterval(() => setNu(new Date()), 60_000)
    return () => window.clearInterval(i)
  }, [])
  return nu
}
