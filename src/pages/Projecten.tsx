import { useState, type ReactNode } from 'react'
import { Bestanden } from '../components/Bestanden'
import { MerkLogo } from '../components/Logo'
import { TaskDrawer } from '../components/TaskDrawer'
import { Avatar, Icon, LeegStaat, PageHead, PriorityBadge, Segmented, StatusBadge, personName } from '../components/ui'
import { CONTENT_SOORTEN, INTERN_FASEN, PRODUCTIE_FASEN, PROJECT_SOORTEN, TEAM } from '../data/mock'
import { ContentBord, contentVan } from '../components/ContentBord'
import type { ContentSoort, Priority, Project, Task } from '../data/types'
import { uid, useMag, useStore } from '../store'
import { deadlineLabel, euro, fmtDate, slug, standaardAfVoor, teLaat } from '../utils'
import { SnelleTaak } from './Taken'

type Soort = 'productie' | 'intern'

const vandaag = () => {
  const x = new Date()
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** "vandaag", "gisteren", "3 dagen geleden", anders de datum. */
function wanneer(date: string): string {
  const dagen = Math.round((new Date(`${vandaag()}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86400000)
  if (dagen === 0) return 'vandaag'
  if (dagen === 1) return 'gisteren'
  if (dagen > 1 && dagen < 7) return `${dagen} dagen geleden`
  return fmtDate(date)
}

/** Tekst met klikbare links en regels zoals getypt. */
export function MetLinks({ text }: { text: string }) {
  const delen: ReactNode[] = []
  text.split(/(https?:\/\/[^\s)]+|www\.[^\s)]+)/g).forEach((p, i) => {
    if (/^(https?:\/\/|www\.)/.test(p)) {
      const href = p.startsWith('www.') ? `https://${p}` : p
      delen.push(<a key={i} href={href} target="_blank" rel="noreferrer">{p.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>)
    } else if (p) delen.push(<span key={i}>{p}</span>)
  })
  return <div className="update-tekst">{delen}</div>
}

/** Producties zijn projecten met soort 'productie'; alles zonder soort is een intern project (zoals vóór ronde 4). */
export const soortVan = (p: Project): Soort => (p.soort === 'productie' ? 'productie' : 'intern')
const fasenVoor = (soort: Soort) => (soort === 'productie' ? PRODUCTIE_FASEN : INTERN_FASEN)
const faseVanProject = (p: Project) => {
  const fasen = fasenVoor(soortVan(p))
  return fasen.find((f) => f.key === p.fase) ?? fasen[soortVan(p) === 'intern' ? 2 : 0]
}
const voortgang = (taken: Task[]) => ({ klaar: taken.filter((t) => t.status === 'klaar').length, totaal: taken.length })
const route = (soort: Soort) => (soort === 'productie' ? 'productie' : 'projecten')

export function Projecten({ soort, id, go }: { soort: Soort; id?: string; go: (r: string) => void }) {
  const { s, d } = useStore()
  const kan = useMag()
  const [weergave, setWeergave] = useState<'bord' | 'lijst'>(() => (localStorage.getItem(`rise-${soort}-weergave`) as 'bord' | 'lijst') || 'bord')
  const [filter, setFilter] = useState<ContentSoort | 'all'>('all')
  const [klant, setKlant] = useState('all')
  const [drag, setDrag] = useState<string | null>(null)
  const [nieuwIn, setNieuwIn] = useState<string | null>(null)
  const [nieuwContent, setNieuwContent] = useState(false)
  const project = s.projects.find((p) => p.id === id)
  if (project) return <ProjectPagina key={project.id} project={project} go={go} />

  const fasen = fasenVoor(soort)
  const alle = s.projects.filter((p) => soortVan(p) === soort)
  const zichtbaar = alle.filter((p) => (filter === 'all' || p.contentSoort === filter) && (klant === 'all' || p.clientId === klant))
  const takenVan = (p: Project) => s.tasks.filter((t) => t.projectId === p.id)
  const zetWeergave = (w: 'bord' | 'lijst') => { setWeergave(w); localStorage.setItem(`rise-${soort}-weergave`, w) }
  const klantenMetProductie = s.clients.filter((c) => alle.some((p) => p.clientId === c.id))

  const maak = (naam: string, fase: string) => {
    const name = naam.trim()
    if (!name) return
    const pid = s.projects.some((p) => p.id === slug(name)) || !slug(name) ? uid() : slug(name)
    const p: Project = {
      id: pid, name, soort, fase: fase as Project['fase'], createdAt: new Date().toISOString(), updates: [], wie: [s.me],
      ...(soort === 'productie' ? { clientId: klant !== 'all' ? klant : undefined, contentSoort: filter !== 'all' ? filter : 'video', priority: 'middel' as Priority } : {}),
    }
    d({ type: 'project:upsert', project: p })
    setNieuwIn(null)
    go(`${route(soort)}/${pid}`)
  }

  // Overzicht bovenaan (alleen Productie)
  const tel = (f: (p: Project) => boolean) => alle.filter(f).length
  const tegels = soort === 'productie' ? [
    { label: "Video's in productie", n: tel((p) => (p.contentSoort ?? 'video') === 'video' && !['feedback', 'live'].includes(p.fase ?? 'productie')) },
    { label: 'Ter goedkeuring', n: tel((p) => p.fase === 'feedback') },
    { label: 'Live', n: tel((p) => p.fase === 'live') },
    { label: 'Statics', n: tel((p) => p.contentSoort === 'static' && p.fase !== 'live') },
    { label: 'Scripts & concepten', n: tel((p) => p.contentSoort === 'script' && p.fase !== 'live') },
    { label: 'Revisies', n: tel((p) => p.contentSoort === 'revisie' && p.fase !== 'live') },
    { label: 'Mails in de maak', n: contentVan(s.clients, 'mail').filter((r) => r.item.status !== 'klaar').length },
    { label: 'Posts in de maak', n: contentVan(s.clients, 'post').filter((r) => r.item.status !== 'klaar').length },
  ] : []
  const contentFilter = soort === 'productie' && (filter === 'mail' || filter === 'post') ? filter : null

  return (
    <>
      <PageHead
        title={soort === 'productie' ? 'Productie' : 'Interne projecten'}
        sub={soort === 'productie' ? 'Alle content per klant in productie. Sleep een kaart naar de volgende fase.' : 'Projecten van Rise zelf: website, SEO, outreach, eigen content.'}>
        <Segmented value={weergave} onChange={zetWeergave} options={[{ value: 'bord', label: 'Bord' }, { value: 'lijst', label: 'Lijst' }]} />
        {contentFilter
          ? kan('klanten_bewerken') && <button className="btn primary" onClick={() => setNieuwContent(true)}><Icon name="plus" size={16} /> {contentFilter === 'mail' ? 'Mail' : 'Post'}</button>
          : kan('projecten') && <button className="btn primary" onClick={() => setNieuwIn(fasen[0].key)}><Icon name="plus" size={16} /> Project</button>}
      </PageHead>

      {soort === 'productie' && (
        <>
          <div className="productie-tegels">
            {tegels.map((t) => <div key={t.label} className="card productie-tegel"><strong>{t.n}</strong><span className="muted small">{t.label}</span></div>)}
          </div>
          <div className="card filter-balk">
            <span className="muted small kop">SOORT</span>
            <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Alles {alle.length}</button>
            {CONTENT_SOORTEN.map((c) => <button key={c.key} className={`chip ${filter === c.key ? 'on' : ''} ${c.key === 'mail' || c.key === 'post' ? 'content-chip' : ''}`} onClick={() => setFilter(c.key)}>{c.label}{(c.key === 'mail' || c.key === 'post') && <span className="aantal">{contentVan(s.clients, c.key).length}</span>}</button>)}
            <span className="filter-rechts">
              <span className="muted small kop">KLANT</span>
              <select value={klant} onChange={(e) => setKlant(e.target.value)}>
                <option value="all">Alle klanten</option>
                {(contentFilter || !klantenMetProductie.length ? s.clients : klantenMetProductie).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </span>
          </div>
        </>
      )}

      {contentFilter && <ContentBord soort={contentFilter} klant={klant} weergave={weergave} nieuwOpen={nieuwContent} onNieuwDicht={() => setNieuwContent(false)} />}

      {!contentFilter && alle.length === 0 && (
        <div className="card"><LeegStaat icon={soort === 'productie' ? 'film' : 'board'} titel={soort === 'productie' ? 'Nog geen producties' : 'Nog geen interne projecten'}
          tekst={soort === 'productie' ? 'Maak een project per batch content, bijvoorbeeld "Ads december" voor een klant.' : 'Bijvoorbeeld de website, SEO of outreach.'}
          actie={kan('projecten') ? { label: 'Eerste project', onClick: () => setNieuwIn(fasen[0].key) } : undefined} /></div>
      )}

      {contentFilter ? null : weergave === 'bord' ? (
        <div className="board pipeline">
          {fasen.map((f) => {
            const col = zichtbaar.filter((p) => faseVanProject(p).key === f.key)
            return (
              <div key={f.key} className={`board-col ${drag ? 'droppable' : ''}`} style={{ background: f.kolom }} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { const p = s.projects.find((x) => x.id === drag); if (p) d({ type: 'project:upsert', project: { ...p, fase: f.key as Project['fase'] } }); setDrag(null) }}>
                <div className="board-col-head">
                  <span className="fase-pil" style={{ color: f.kleur, background: f.bg }}><i style={{ background: f.kleur }} />{f.label}</span>
                  <span className="count">{col.length}</span>
                </div>
                {f.key === 'feedback' && col.length === 0 && <p className="muted small" style={{ margin: '4px 4px 8px' }}>Nog niets ter goedkeuring bij de klant.</p>}
                {col.map((p) => <ProjectKaart key={p.id} p={p} taken={takenVan(p)} onDrag={setDrag} onOpen={() => go(`${route(soort)}/${p.id}`)} />)}
                {kan('projecten') && (nieuwIn === f.key
                  ? <NieuwKaart onKlaar={(naam) => maak(naam, f.key)} onStop={() => setNieuwIn(null)} />
                  : <button className="kolom-nieuw" onClick={() => setNieuwIn(f.key)}><Icon name="plus" size={13} /> Nieuw</button>)}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card flush">
          <table className="table">
            <thead><tr><th>Project</th>{soort === 'productie' && <th>Klant</th>}<th>Fase</th>{soort === 'productie' && <th>Soort</th>}<th>Taken</th><th>Deadline</th><th>Wie</th></tr></thead>
            <tbody>
              {zichtbaar.map((p) => {
                const v = voortgang(takenVan(p))
                const f = faseVanProject(p)
                return (
                  <tr key={p.id} className="task-row" onClick={() => go(`${route(soort)}/${p.id}`)}>
                    <td className="task-title">{p.name}{(p.bestanden?.length ?? 0) > 0 && <span className="muted small comment-count"><Icon name="clip" size={12} /> {p.bestanden!.length}</span>}</td>
                    {soort === 'productie' && <td className="muted">{s.clients.find((c) => c.id === p.clientId)?.name ?? '—'}</td>}
                    <td><span className="fase-pil" style={{ color: f.kleur, background: f.bg }}><i style={{ background: f.kleur }} />{f.label}</span></td>
                    {soort === 'productie' && <td className="muted small">{CONTENT_SOORTEN.find((c) => c.key === p.contentSoort)?.label ?? '—'}</td>}
                    <td className="muted small">{v.totaal ? `${v.klaar}/${v.totaal}` : '—'}</td>
                    <td className={`small ${p.deadline && teLaat(p.deadline) && f.key !== 'live' && f.key !== 'afgerond' ? 'late' : 'muted'}`}>{p.deadline ? deadlineLabel(p.deadline, f.key === 'live' || f.key === 'afgerond') : '—'}</td>
                    <td><span className="avatar-rij">{(p.wie ?? []).map((w) => <Avatar key={w} id={w} size={22} />)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {zichtbaar.length === 0 && alle.length > 0 && <p className="muted small" style={{ padding: 16 }}>Niets met dit filter.</p>}
        </div>
      )}
    </>
  )
}

function NieuwKaart({ onKlaar, onStop }: { onKlaar: (naam: string) => void; onStop: () => void }) {
  const [naam, setNaam] = useState('')
  return (
    <div className="board-card nieuw-kaart">
      <input autoFocus placeholder="Naam, bijv. Ads december" value={naam} onChange={(e) => setNaam(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onKlaar(naam); if (e.key === 'Escape') onStop() }} />
      <div className="nieuw-kaart-knoppen">
        <button className="btn small primary" onClick={() => onKlaar(naam)} disabled={!naam.trim()}>Maken</button>
        <button className="btn small ghost" onClick={onStop}>Annuleren</button>
      </div>
    </div>
  )
}

function ProjectKaart({ p, taken, onDrag, onOpen }: { p: Project; taken: Task[]; onDrag: (id: string | null) => void; onOpen: () => void }) {
  const { s } = useStore()
  const kan = useMag()
  const v = voortgang(taken)
  const klant = s.clients.find((c) => c.id === p.clientId)
  const f = faseVanProject(p)
  const klaarFase = f.key === 'live' || f.key === 'afgerond'
  return (
    <div className="board-card project-kaart" draggable={kan('projecten')} onDragStart={() => onDrag(p.id)} onDragEnd={() => onDrag(null)} onClick={onOpen}>
      {klant && <div className="muted small">{klant.name}</div>}
      {!klant && soortVan(p) === 'intern' && <div className="kaart-kop"><MerkLogo merk={p} naam={p.name} size={20} /></div>}
      <div className="board-card-title">{p.name}</div>
      <div className="kaart-labels">
        {p.priority && <PriorityBadge p={p.priority} />}
        {p.contentSoort && <span className="badge">{CONTENT_SOORTEN.find((c) => c.key === p.contentSoort)?.label}</span>}
        {(p.bestanden?.length ?? 0) > 0 && <span className="badge" title="Bestanden"><Icon name="clip" size={11} /> {p.bestanden!.length}</span>}
      </div>
      <div className="row-progress">
        <span className="muted small">☑ {v.klaar}/{v.totaal} taken</span>
        <span className="mini-bar"><i style={{ width: `${v.totaal ? (v.klaar / v.totaal) * 100 : 0}%` }} /></span>
      </div>
      <div className="board-card-foot">
        {kan('geld') && p.bedrag ? <span className="small strong">{euro(p.bedrag)}</span> : <span className="muted small">—</span>}
        <span className={`small ${p.deadline && !klaarFase && teLaat(p.deadline) ? 'late' : 'muted'}`}>{klaarFase && f.key === 'live' ? 'Live' : p.deadline ? fmtDate(p.deadline) : ''}</span>
        <span className="avatar-rij">{(p.wie ?? []).slice(0, 3).map((w) => <Avatar key={w} id={w} size={22} />)}</span>
      </div>
    </div>
  )
}

function ProjectPagina({ project, go }: { project: Project; go: (r: string) => void }) {
  const { s, d } = useStore()
  const kan = useMag()
  const soort = soortVan(project)
  const [tekst, setTekst] = useState('')
  const [datum, setDatum] = useState(vandaag())
  const [voorKlant, setVoorKlant] = useState(false)
  const [open, setOpen] = useState<Task | null>(null)
  const [klaarTonen, setKlaarTonen] = useState(false)
  const [link, setLink] = useState({ title: '', url: '' })
  const taken = s.tasks.filter((t) => t.projectId === project.id)
  const openTaken = taken.filter((t) => t.status !== 'klaar').sort((a, b) => Number(Boolean(b.inTodo)) - Number(Boolean(a.inTodo)) || (a.deadline || '9').localeCompare(b.deadline || '9'))
  const klaar = taken.filter((t) => t.status === 'klaar')
  const v = voortgang(taken)
  const wijzig = (patch: Partial<Project>) => d({ type: 'project:upsert', project: { ...project, ...patch } })
  const fasen = fasenVoor(soort)
  const klant = s.clients.find((c) => c.id === project.clientId)

  const plaats = () => {
    if (!tekst.trim()) return
    d({ type: 'project:update', id: project.id, update: { id: uid(), date: datum || vandaag(), at: new Date().toISOString(), author: s.me, text: tekst.trim(), ...(voorKlant && project.clientId ? { klant: true } : {}) } })
    setTekst('')
    setVoorKlant(false)
    setDatum(vandaag())
  }
  const todo = (t: Task, aan: boolean) =>
    d({ type: 'task:upsert', task: { ...t, inTodo: aan, deadline: aan && !t.deadline ? standaardAfVoor() : t.deadline, updatedAt: new Date().toISOString() } })
  const voegLinkToe = () => {
    if (!/^https?:\/\//.test(link.url.trim())) return
    wijzig({ links: [{ id: uid(), title: link.title.trim() || link.url.trim(), url: link.url.trim(), at: new Date().toISOString(), by: s.me }, ...(project.links ?? [])] })
    setLink({ title: '', url: '' })
  }
  const verwijder = () => {
    if (!window.confirm(`${project.name} verwijderen? De taken blijven bestaan, maar zijn dan niet meer aan dit project gekoppeld.`)) return
    d({ type: 'weg', table: 'projects', id: project.id })
    go(route(soort))
  }

  return (
    <>
      <button className="back" onClick={() => go(route(soort))}>← {soort === 'productie' ? 'Productie' : 'Interne projecten'}</button>
      <PageHead title={project.name} sub={klant ? <>Voor <a href={`#/klanten/${klant.id}`}>{klant.name}</a></> : project.description || (soort === 'intern' ? 'Intern project van Rise' : 'Nog geen klant gekozen')}>
        <select className="fase-select" value={faseVanProject(project).key} onChange={(e) => wijzig({ fase: e.target.value as Project['fase'] })} disabled={!kan('projecten')}>
          {fasen.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </PageHead>

      <div className="two-col">
        <div>
          <div className="section-row">
            <h3 className="section-title">Taken {v.totaal > 0 && <span className="muted small">{v.klaar}/{v.totaal} af</span>}</h3>
          </div>
          {v.totaal > 0 && <div className="mini-bar groot"><i style={{ width: `${(v.klaar / v.totaal) * 100}%` }} /></div>}
          <SnelleTaak projectId={project.id} />
          <div className="card flush">
            {openTaken.length === 0 && <LeegStaat icon="tasks" titel="Nog geen open taken" tekst={soort === 'productie' ? 'Bijvoorbeeld script, shoot, edit, revisie. Ze komen ook in Taken en Planning.' : 'Zet hier alles neer wat ooit moet gebeuren; op de to-do lijst komt het pas als iemand het erop zet.'} />}
            {openTaken.map((t) => (
              <div key={t.id} className="project-taak">
                <button className="project-taak-titel" onClick={() => setOpen(t)}>
                  <span>{t.title}</span>
                  <span className="muted small">{t.inTodo ? `${personName(t.assignee)} · ${t.deadline ? deadlineLabel(t.deadline) : 'geen deadline'}` : 'Nog niet ingepland'}</span>
                </button>
                {t.status !== 'todo' && <StatusBadge s={t.status} />}
                {soort === 'intern' && (t.inTodo ? (
                  <button className="btn small todo-aan" title="Van de to-do lijst halen" onClick={() => todo(t, false)}><Icon name="check" size={13} /> Op to-do</button>
                ) : (
                  <button className="btn small" title="Op de to-do lijst zetten" onClick={() => todo(t, true)}><Icon name="plus" size={13} /> To-do</button>
                ))}
              </div>
            ))}
          </div>
          {klaar.length > 0 && (
            <>
              <button className="link small" onClick={() => setKlaarTonen(!klaarTonen)}>{klaarTonen ? 'Verberg' : 'Toon'} {klaar.length} afgeronde taken</button>
              {klaarTonen && (
                <div className="card flush" style={{ marginTop: 8 }}>
                  {klaar.map((t) => (
                    <div key={t.id} className="project-taak klaar">
                      <button className="project-taak-titel" onClick={() => setOpen(t)}><span>{t.title}</span><span className="muted small">{personName(t.assignee)}</span></button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <h3 className="section-title" style={{ marginTop: 18 }}>Notities</h3>
          <textarea className="card notitie-veld" rows={5} placeholder="Brief, script, afspraken met de klant…" value={project.notities ?? ''} onChange={(e) => wijzig({ notities: e.target.value || undefined })} />

          <h3 className="section-title" style={{ marginTop: 18 }}>Updates</h3>
          <div className="card update-nieuw">
            <textarea rows={3} placeholder={`Wat heb je gedaan? Bijv. "Edit V1 gedeeld: https://…"`} value={tekst}
              onChange={(e) => setTekst(e.target.value)} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && plaats()} />
            <div className="update-balk">
              <label className="small muted">Datum <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
              {soort === 'productie' && project.clientId && <label className="small muted"><input type="checkbox" checked={voorKlant} onChange={(e) => setVoorKlant(e.target.checked)} /> Ook in het klantportaal</label>}
              <span className="muted small">als {personName(s.me)}</span>
              <button className="btn primary small" onClick={plaats} disabled={!tekst.trim()}>Update plaatsen</button>
            </div>
          </div>
          <ol className="updates">
            {project.updates.length === 0 && <li className="muted small">Nog geen updates.</li>}
            {project.updates.map((u) => (
              <li key={u.id}>
                <Avatar id={u.author} size={30} />
                <div>
                  <div className="update-meta">
                    <strong>{personName(u.author)}</strong>
                    <span className="muted"> · {wanneer(u.date)}</span>
                    {u.klant && <span className="badge status-klaar" title="Staat in het klantportaal">in portaal</span>}
                    {u.author === s.me && (
                      <button className="icon-btn" aria-label="Update verwijderen" onClick={() => window.confirm('Deze update verwijderen?') && d({ type: 'project:update:weg', id: project.id, updateId: u.id })}><Icon name="x" size={13} /></button>
                    )}
                  </div>
                  <MetLinks text={u.text} />
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3 className="section-title">Gegevens</h3>
          <fieldset className="kaal card info-list" disabled={!kan('projecten')}>
            <div><span className="muted">Naam</span><input className="inline-input" value={project.name} onChange={(e) => wijzig({ name: e.target.value })} /></div>
            {soort === 'productie' && (
              <div><span className="muted">Klant</span>
                <select value={project.clientId ?? ''} onChange={(e) => wijzig({ clientId: e.target.value || undefined })}>
                  <option value="">Kies klant…</option>
                  {s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {soort === 'productie' && (
              <div><span className="muted">Soort</span>
                <select value={project.contentSoort ?? 'video'} onChange={(e) => wijzig({ contentSoort: e.target.value as ContentSoort })}>
                  {PROJECT_SOORTEN.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
            )}
            <div><span className="muted">Prioriteit</span>
              <select value={project.priority ?? 'middel'} onChange={(e) => wijzig({ priority: e.target.value as Priority })}>
                <option value="hoog">Hoog</option><option value="middel">Middel</option><option value="laag">Laag</option>
              </select>
            </div>
            {kan('geld') && <div><span className="muted">Bedrag (ex btw)</span><input className="inline-input" type="number" min={0} step={50} placeholder="€ 0" value={project.bedrag ?? ''} onChange={(e) => wijzig({ bedrag: Number(e.target.value) || undefined })} /></div>}
            <div><span className="muted">Af vóór</span><input className="inline-input" type="date" value={project.deadline ?? ''} onChange={(e) => wijzig({ deadline: e.target.value || undefined })} /></div>
            <div><span className="muted">Wie</span>
              <span className="wie-keuze">
                {TEAM.filter((p) => p.niveau !== 'uit').map((p) => {
                  const aan = (project.wie ?? []).includes(p.id)
                  return (
                    <button key={p.id} className={`chip ${aan ? 'on' : ''}`} onClick={() => wijzig({ wie: aan ? (project.wie ?? []).filter((w) => w !== p.id) : [...(project.wie ?? []), p.id] })}>
                      <Avatar id={p.id} size={16} /> {p.name.split(' ')[0]}
                    </button>
                  )
                })}
              </span>
            </div>
            {soort === 'intern' && <div><span className="muted">Omschrijving</span><input className="inline-input" value={project.description ?? ''} onChange={(e) => wijzig({ description: e.target.value || undefined })} /></div>}
            {soort === 'intern' && <div><span className="muted">Website</span><input className="inline-input" placeholder="voor de kaartafbeelding" value={project.website ?? ''} onChange={(e) => wijzig({ website: e.target.value.trim() || undefined })} /></div>}
          </fieldset>

          <h3 className="section-title" style={{ marginTop: 18 }}>Bestanden <span className="muted small">pdf's, scripts, briefs, beelden</span></h3>
          <div className="card">
            <Bestanden map={`project/${project.id}`} lijst={project.bestanden ?? []} onChange={(bestanden) => wijzig({ bestanden })} />
          </div>

          <h3 className="section-title" style={{ marginTop: 18 }}>Links <span className="muted small">Frame.io, Drive, Dropbox</span></h3>
          <div className="card">
            <ul className="bestand-lijst">
              {(project.links ?? []).map((l) => (
                <li key={l.id}>
                  <a className="bestand-naam" href={l.url} target="_blank" rel="noreferrer"><Icon name="external" size={14} /><span>{l.title}</span></a>
                  <span className="muted small">{l.by ? personName(l.by) : ''}</span>
                  {kan('verwijderen') && <button className="icon-btn" aria-label="Link weghalen" onClick={() => window.confirm(`Link "${l.title}" weghalen?`) && wijzig({ links: (project.links ?? []).filter((x) => x.id !== l.id) })}><Icon name="x" size={13} /></button>}
                </li>
              ))}
            </ul>
            <div className="inline-form">
              <input placeholder="Titel (optioneel)" value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} />
              <input placeholder="https://…" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && voegLinkToe()} />
              <button className="btn small" onClick={voegLinkToe} disabled={!/^https?:\/\//.test(link.url.trim())}>Toevoegen</button>
            </div>
          </div>

          {kan('verwijderen') && <button className="link small danger" style={{ marginTop: 18 }} onClick={verwijder}>Project verwijderen…</button>}
        </div>
      </div>
      {open && <TaskDrawer key={open.id} task={open} onClose={() => setOpen(null)} />}
    </>
  )
}
