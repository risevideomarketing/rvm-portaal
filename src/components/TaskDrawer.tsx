import { useState } from 'react'
import { SOORTEN, TEAM } from '../data/mock'
import type { PersonId, Priority, Soort, Subtask, Task, TaskStatus } from '../data/types'
import { isStil, suggestSubtasks, werkurenSinds } from '../rules'
import { progress, startTask, toggleSubtask, uid, useMag, useStore } from '../store'
import { notify } from '../slack'
import { deadlineLabel, fmtDateTime, standaardAfVoor, verdeelDeadlines } from '../utils'
import { VoorSelect, gekoppeld, voorVan } from './VoorSelect'
import { Avatar, Drawer, Icon, MentionText, STATUS_LABEL, personName } from './ui'

export function newTask(partial: Partial<Task> = {}, me: PersonId = 'daan'): Task {
  return {
    id: uid(),
    title: '',
    priority: 'middel',
    soort: 'Klantwerk',
    deadline: standaardAfVoor(),
    assignee: me,
    status: 'todo',
    inAgenda: true,
    comments: [],
    ...partial,
  }
}

export function TaskDrawer({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { s, d } = useStore()
  const kan = useMag()
  const [draft, setDraft] = useState<Task | null>(task)
  const [comment, setComment] = useState('')
  // Voorstel voor deeltaken: volgt de titel tot iemand het aanpast
  const [edited, setEdited] = useState<string[] | null>(task?.subtasks && !task.subtasksConfirmed ? task.subtasks.map((x) => x.title) : null)
  const [newSub, setNewSub] = useState('')
  if (!task || !draft) return null
  const isNew = !s.tasks.some((t) => t.id === task.id)
  const live = s.tasks.find((t) => t.id === task.id) ?? draft
  const cur = isNew ? draft : live
  const alleenLezen = !isNew && !kan('taken_anderen') && cur.assignee !== s.me
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setDraft({ ...draft, [k]: v })
  const ctx = s.clients.find((c) => c.id === draft.clientId)?.name ?? s.contacts.find((c) => c.id === draft.contactId)?.company
  const sugg = edited ?? (draft.title.trim() ? suggestSubtasks(draft.title, ctx) : [])
  const confirmed = !!cur.subtasksConfirmed
  const p = progress(cur)

  /** Wijziging aan deeltaken/status meteen doorvoeren (bestaande taak) of in het concept (nieuwe taak). */
  const apply = (next: Task) => {
    const pick = { subtasks: next.subtasks, subtasksConfirmed: next.subtasksConfirmed, status: next.status, startedAt: next.startedAt, updatedAt: next.updatedAt }
    if (!isNew) d({ type: 'task:upsert', task: { ...live, ...pick } })
    setDraft({ ...draft, ...pick })
  }
  const toSubs = (titles: string[]): Subtask[] => verdeelDeadlines(titles.filter((x) => x.trim()).map((title) => ({ id: uid(), title: title.trim(), done: false })), draft.deadline)
  /** Voorgestelde sub-deadlines bij het voorstel (worden vastgezet bij "Klopt"). */
  const voorstelData = verdeelDeadlines(sugg.map((title) => ({ title, done: false as boolean, deadline: undefined as string | undefined })), draft.deadline)
  const zetSubDeadline = (id: string, deadline: string) =>
    apply({ ...cur, subtasks: (cur.subtasks ?? []).map((st) => (st.id === id ? { ...st, deadline: deadline || undefined } : st)), updatedAt: new Date().toISOString() })
  const herverdeel = () =>
    apply({ ...cur, subtasks: verdeelDeadlines((cur.subtasks ?? []).map((st) => (st.done ? st : { ...st, deadline: undefined })), draft.deadline), updatedAt: new Date().toISOString() })
  const confirm = () => { apply({ ...cur, subtasks: toSubs(sugg), subtasksConfirmed: true, updatedAt: new Date().toISOString() }); setEdited(null) }
  const start = () => apply(startTask(cur, confirmed ? cur.subtasks ?? [] : toSubs(sugg)))
  const addSub = () => {
    if (!newSub.trim()) return
    apply({ ...cur, subtasks: [...(cur.subtasks ?? []), { id: uid(), title: newSub.trim(), deadline: draft.deadline || undefined, done: false }], subtasksConfirmed: true })
    setNewSub('')
  }
  const editSugg = (i: number, v: string | null) => {
    const list = [...sugg]
    if (v === null) list.splice(i, 1)
    else list[i] = v
    setEdited(list)
  }

  const save = () => {
    if (!draft.title.trim() || !gekoppeld(draft)) return
    const subs = isNew && !confirmed ? { subtasks: toSubs(sugg), subtasksConfirmed: false } : {}
    d({ type: 'task:upsert', task: { ...draft, ...subs, comments: live.comments, updatedAt: new Date().toISOString() } })
    onClose()
  }

  const addComment = () => {
    if (!comment.trim()) return
    const c = { id: uid(), author: s.me, text: comment.trim(), at: new Date().toISOString() }
    if (isNew) setDraft({ ...draft, comments: [...draft.comments, c] })
    else {
      d({ type: 'task:comment', taskId: task.id, comment: c })
      if (s.live && /@\w+/.test(c.text)) notify({ kind: 'tag', taskId: task.id, text: c.text })
    }
    setComment('')
  }

  const toggle = (id: string) => {
    const next = toggleSubtask(cur, id, s.me)
    apply(next)
    const st = next.subtasks?.find((x) => x.id === id)
    if (s.live && !isNew && st?.done && /slack ter feedback/i.test(st.title)) notify({ kind: 'feedback', taskId: task.id, step: st.title })
  }

  const comments = isNew ? draft.comments : live.comments

  return (
    <Drawer open onClose={onClose} title={isNew ? 'Nieuwe taak' : 'Taak'}>
      {alleenLezen && <div className="demo-note">Dit is de taak van {personName(cur.assignee)}. Je kunt meekijken en reageren, niet aanpassen.</div>}
      <fieldset className="kaal" disabled={alleenLezen}>
      <input className="title-input" placeholder="Wat moet er gebeuren?" value={draft.title} autoFocus={isNew} onChange={(e) => set('title', e.target.value)} />

      {draft.auto && (
        <div className="demo-note">Automatisch aangemaakt: voorstel verstuurd en na 5 dagen geen reactie in de mailbox. Zet hem op Klaar zodra je hebt opgevolgd.</div>
      )}

      {!isNew && (
        <div className="start-bar">
          {cur.status === 'todo' ? (
            <>
              <button className="btn start" onClick={start}><Icon name="play" size={14} /> Start ermee</button>
              <span className="muted small">Zet de taak op Bezig en laat het team zien dat {personName(cur.assignee)} eraan werkt.</span>
            </>
          ) : cur.status === 'klaar' ? (
            <span className="badge status-klaar">Klaar</span>
          ) : (
            <>
              <span className="badge status-bezig">{STATUS_LABEL[cur.status]}</span>
              {cur.startedAt && <span className="muted small">Gestart {fmtDateTime(cur.startedAt)} · laatste update {fmtDateTime(cur.updatedAt ?? cur.startedAt)}</span>}
              {isStil(cur) && <span className="badge prio-hoog">{werkurenSinds(cur.updatedAt ?? cur.startedAt!)} werkuur geen update</span>}
            </>
          )}
        </div>
      )}

      <div className="subtasks">
        {confirmed ? (
          <>
            <div className="sub-head">
              <h3 className="section-title">Deeltaken</h3>
              <span className="muted small">{p.done} van {p.total} klaar</span>
            </div>
            <div className="progress"><div style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></div>
            <ul className="sub-list">
              {(cur.subtasks ?? []).map((st) => (
                <li key={st.id} className={`${st.done ? 'done' : ''} ${p.next?.id === st.id ? 'next' : ''}`}>
                  <label>
                    <input type="checkbox" checked={st.done} onChange={() => toggle(st.id)} />
                    <span>{st.title}</span>
                  </label>
                  {p.next?.id === st.id && <span className="next-badge">Volgende stap</span>}
                  {st.done && st.doneBy && <span className="muted small">{personName(st.doneBy)} · {fmtDateTime(st.doneAt!)}</span>}
                  {!st.done && (
                    <label className="sub-date" title="Af vóór (de echte deadline is de dag ervoor om 18:00)">
                      <input type="date" value={st.deadline ?? ''} onChange={(e) => zetSubDeadline(st.id, e.target.value)} />
                      <span className="muted small">{st.deadline ? deadlineLabel(st.deadline, st.done) : 'geen datum'}</span>
                    </label>
                  )}
                </li>
              ))}
            </ul>
            <div className="inline-form">
              <input placeholder="Deeltaak toevoegen" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSub()} />
            </div>
            {(cur.subtasks ?? []).some((st) => !st.done) && draft.deadline && (
              <p className="muted small sub-hint">Elke stap staat met zijn eigen datum in de Rise-agenda. <button className="link small" onClick={herverdeel}>Opnieuw verdelen tot de deadline</button></p>
            )}
          </>
        ) : sugg.length > 0 ? (
          <div className="sugg">
            <div className="sub-head">
              <h3 className="section-title"><Icon name="check" size={15} /> Voorgestelde deeltaken. Klopt dit?</h3>
            </div>
            <ol className="sugg-list">
              {sugg.map((x, i) => (
                <li key={i}>
                  <span className="step-n">{i + 1}</span>
                  <input value={x} onChange={(e) => editSugg(i, e.target.value)} />
                  {voorstelData[i]?.deadline && <span className="muted small sugg-date">{deadlineLabel(voorstelData[i].deadline!)}</span>}
                  <button className="icon-btn" aria-label="Weghalen" onClick={() => editSugg(i, null)}><Icon name="x" size={14} /></button>
                </li>
              ))}
            </ol>
            <div className="sugg-actions">
              <button className="btn primary small" onClick={confirm}>Klopt</button>
              <button className="btn small" onClick={() => setEdited([...sugg, ''])}><Icon name="plus" size={13} /> Stap toevoegen</button>
              {edited && <button className="btn ghost small" onClick={() => setEdited(null)}>Opnieuw voorstellen</button>}
              {isNew && <span className="muted small">Niet bevestigd? Dan vraagt Slack het straks nog een keer.</span>}
            </div>
          </div>
        ) : null}
      </div>
      <div className="form-grid">
        <label>
          Wie
          <select value={draft.assignee} onChange={(e) => set('assignee', e.target.value as PersonId)}>
            {TEAM.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label>
          Fase
          <select value={draft.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((k) => (
              <option key={k} value={k}>{STATUS_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <label>
          Prioriteit
          <select value={draft.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            <option value="hoog">Hoog</option>
            <option value="middel">Middel</option>
            <option value="laag">Laag</option>
          </select>
        </label>
        <label>
          Soort
          <select value={draft.soort} onChange={(e) => set('soort', e.target.value as Soort)}>
            {SOORTEN.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label>
          Af vóór
          <input type="date" value={draft.deadline} onChange={(e) => set('deadline', e.target.value)} />
          {draft.deadline && <span className="muted small">Deadline: {deadlineLabel(draft.deadline, draft.status === 'klaar')}</span>}
        </label>
        <label>
          Voor
          <VoorSelect value={voorVan(draft, s.clients)}
            onChange={(v) => {
              if (v.startsWith('p.')) {
                const p = s.projects.find((x) => x.id === v.slice(2))
                const c = s.clients.find((x) => x.id === p?.clientId)
                setDraft({ ...draft, projectId: v.slice(2), clientId: c?.id, contactId: c?.contactId ?? draft.contactId, inTodo: p?.soort === 'productie' ? true : draft.inTodo ?? true, deadline: draft.deadline || standaardAfVoor() })
              } else if (v.startsWith('c.')) setDraft({ ...draft, contactId: v.slice(2), clientId: undefined, projectId: undefined, inTodo: undefined })
              else setDraft({ ...draft, clientId: v || undefined, contactId: v ? s.clients.find((c) => c.id === v)?.contactId ?? draft.contactId : draft.contactId, projectId: undefined, inTodo: undefined })
            }} />
        </label>
        <label>
          Contact (CRM)
          <select value={draft.contactId ?? ''} onChange={(e) => set('contactId', e.target.value || undefined)}>
            <option value="">Geen</option>
            {s.contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.company} · {c.name}</option>
            ))}
          </select>
        </label>
      </div>

      {draft.projectId && (
        <label className="check-row">
          <input type="checkbox" checked={draft.inTodo === true} onChange={(e) => setDraft({ ...draft, inTodo: e.target.checked, deadline: e.target.checked && !draft.deadline ? standaardAfVoor() : draft.deadline })} />
          <Icon name="tasks" size={16} /> Op de to-do lijst
          <span className="muted small">(project {s.projects.find((p) => p.id === draft.projectId)?.name ?? ''}; zonder vinkje staat hij alleen in het project)</span>
        </label>
      )}

      <label className="check-row">
        <input type="checkbox" checked={draft.alleenVoor === true} onChange={(e) => set('alleenVoor', e.target.checked || undefined)} />
        Taak van alleen {personName(draft.assignee)}
        <span className="muted small">(dan staat de profielfoto bij de taak)</span>
      </label>

      {kan('vertrouwelijk') && (
        <label className="check-row">
          <input type="checkbox" checked={draft.vertrouwelijk === true} onChange={(e) => set('vertrouwelijk', e.target.checked || undefined)} />
          <Icon name="lock" size={15} /> Vertrouwelijk
          <span className="muted small">(alleen zichtbaar voor beheerders en wie dat recht heeft)</span>
        </label>
      )}

      <label className="check-row">
        <input type="checkbox" checked={draft.inAgenda} onChange={(e) => set('inAgenda', e.target.checked)} />
        <Icon name="calendar" size={16} /> Deadline in de Rise-agenda zetten
        <span className="muted small">(gedeelde Google Agenda, de avond ervoor om 18:00)</span>
      </label>

      <label className="block-label">
        Omschrijving
        <textarea rows={3} value={draft.description ?? ''} placeholder="Context, links, wat 'klaar' betekent…" onChange={(e) => set('description', e.target.value)} />
      </label>

      <div className="drawer-actions">
        <button className="btn primary" onClick={save} disabled={!draft.title.trim() || !gekoppeld(draft)} title={gekoppeld(draft) ? undefined : 'Kies eerst voor welke klant of welk project'}>
          {isNew ? 'Taak aanmaken' : 'Opslaan'}
        </button>
        {!gekoppeld(draft) && <span className="small danger-tekst">Kies bij "Voor" een klant of project.</span>}
        <button className="btn ghost" onClick={onClose}>Annuleren</button>
        {!isNew && kan('verwijderen') && (
          <button
            className="btn ghost danger taak-weg"
            onClick={() => {
              if (!window.confirm(`"${live.title}" verwijderen? De taak verdwijnt voor iedereen, ook uit de agenda. Dit kun je niet terugdraaien.`)) return
              d({ type: 'task:weg', id: live.id })
              onClose()
            }}
          >
            Verwijderen
          </button>
        )}
      </div>
      </fieldset>

      <h3 className="section-title">Opmerkingen</h3>
      <div className="comments">
        {comments.length === 0 && <p className="muted small">Nog geen opmerkingen. Tag een collega met @Naam.</p>}
        {comments.map((c) => (
          <div className="comment" key={c.id}>
            <Avatar id={c.author} size={24} />
            <div>
              <div className="comment-meta">
                <strong>{personName(c.author)}</strong> <span className="muted small">{fmtDateTime(c.at)}</span>
              </div>
              <div><MentionText text={c.text} /></div>
            </div>
          </div>
        ))}
      </div>
      <div className="comment-box">
        <textarea rows={2} placeholder="Schrijf een opmerking… (@ om te taggen)" value={comment} onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment() }} />
        <div className="mention-bar">
          {TEAM.filter((t) => t.id !== s.me).map((t) => (
            <button key={t.id} className="chip" onClick={() => setComment((c) => `${c}${c && !c.endsWith(' ') ? ' ' : ''}@${t.name} `)}>@{t.name}</button>
          ))}
          <button className="btn small" onClick={addComment} disabled={!comment.trim()}>Plaatsen</button>
        </div>
      </div>
    </Drawer>
  )
}
