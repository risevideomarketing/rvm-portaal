import { StrippenkaartBeheer } from '../components/Strippenkaart'
import { useEffect, useState } from 'react'
import { Bestanden } from '../components/Bestanden'
import { CommissieBlok } from '../components/Commissie'
import { ContentKalender } from '../components/ContentKalender'
import { FrameEmbed, frameInsluitbaar } from '../components/FrameEmbed'
import { Progress } from '../components/charts'
import { MerkLogo, MerkVelden } from '../components/Logo'
import { TaskDrawer, newTask } from '../components/TaskDrawer'
import { Icon, LeegStaat, PageHead, personName } from '../components/ui'
import { PHASES, TRAJECTEN, faseVan, fasenVan } from '../data/mock'
import type { Client, ContentPlek, Phase, Project, Task } from '../data/types'
import { frameLinkVolledig, giveAccess, klantFacturen, weekoverzichtNu, type KlantFactuur } from '../slack'
import { uid, useMag, useStore } from '../store'
import { bezigMet, bronVan, euro, fmtDate, pakketNaam } from '../utils'
import { Contactpersonen, OffertesTab, offerteNaarProject } from './Crm'
import { metOngedaan } from '../components/Ongedaan'
import { SnelleTaak, TaskTable } from './Taken'

export function Klanten({ id, go, contentItem }: { id?: string; go: (r: string) => void; contentItem?: string }) {
  const kan = useMag()
  const { s } = useStore()
  const client = s.clients.find((c) => c.id === id)
  if (client) return <KlantDetail key={client.id} client={client} go={go} contentItem={contentItem} />
  if (id) return (
    <div className="card leeg-staat" style={{ marginTop: 24 }}>
      <strong>Dit klantprofiel bestaat niet (meer)</strong>
      <button className="btn" onClick={() => go('crm')}>Naar het CRM</button>
    </div>
  )

  return (
    <>
      <PageHead title="Klanten" sub="Elke klant is een project: klik erop voor de fase, alle open taken, bestanden en de planning." />
      <div className="client-grid">
        {s.clients.map((c) => {
          const open = s.tasks.filter((t) => (t.clientId === c.id || (c.contactId && t.contactId === c.contactId)) && t.status !== 'klaar')
          const merk = s.contacts.find((x) => x.id === c.contactId)
          return (
            <button key={c.id} className="card client-card" onClick={() => go(`klanten/${c.id}`)}>
              <div className="kaart-kop">
                <MerkLogo merk={merk} naam={c.name} size={40} />
                <div className="client-card-head">
                  <strong>{c.name}</strong>
                  <span className="muted small">{kan('geld') ? c.pakket : pakketNaam(c.pakket)}</span>
                </div>
              </div>
              <div className="phase-label">{faseVan(c).label}</div>
              <Progress value={c.phase + 1} max={fasenVan(c).length} />
              <div className="client-card-foot muted small">
                <span>Fase {Math.min(c.phase + 1, fasenVan(c).length)} van {fasenVan(c).length}</span>
                <span>{open.length} open taken</span>
                {c.nextShoot && <span>Shoot {fmtDate(c.nextShoot)}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

function KlantDetail({ client, go, contentItem }: { client: Client; go: (r: string) => void; contentItem?: string }) {
  const kan = useMag()
  const { s, d } = useStore()
  const [task, setTask] = useState<Task | null>(null)
  const contact = s.contacts.find((c) => c.id === client.contactId)
  useEffect(() => bezigMet(client.id), [client.id])
  // Taken van een project staan op de projectpagina; hier alleen de losse taken voor deze klant (nooit dubbel)
  const projectIds = new Set(s.projects.filter((p) => p.clientId === client.id).map((p) => p.id))
  const tasks = s.tasks.filter((t) => (t.clientId === client.id || (client.contactId && t.contactId === client.contactId)) && !(t.projectId && projectIds.has(t.projectId))).sort((a, b) => a.deadline.localeCompare(b.deadline))
  const update = (patch: Partial<Client>) => d({ type: 'client:upsert', client: { ...client, ...patch } })

  return (
    <>
      <button className="back" onClick={() => go('crm')}>← CRM</button>
      <PageHead title={client.name} sub={<>{kan('geld') ? client.pakket : pakketNaam(client.pakket)} · klant sinds {fmtDate(client.start)}</>}>
        <button className="btn" onClick={() => go(`portaal/${client.id}/als-klant`)}><Icon name="portal" size={16} /> Bekijk als klant</button>
        <button className="btn primary" onClick={() => setTask(newTask({ clientId: client.id, contactId: client.contactId }, s.me))}><Icon name="plus" size={16} /> Taak</button>
      </PageHead>

      <ProjectTrajecten client={client} go={go} />

      <div className="two-col dossier-top">
        <div>
          <div className="section-row"><h3 className="section-title">Bestanden & links</h3></div>
          <fieldset className="kaal" disabled={!kan('klanten_bewerken')}><Links client={client} update={update} /></fieldset>
        </div>
        <div>
          <div className="section-row"><h3 className="section-title">Pdf's en facturen <span className="muted small">(alleen het team)</span></h3></div>
          <div className="card">
            <Bestanden map={`klant/${client.id}`} lijst={client.bestanden ?? []} onChange={(bestanden) => update({ bestanden })} leeg="Nog geen pdf's of bestanden. Bijv. het voorstel, de overeenkomst of brand guidelines." />
          </div>
        </div>
      </div>

      <div className="section-row" id="strippenkaart">
        <h3 className="section-title">Strippenkaart <span className="muted small">(vink een strip af als hij gebruikt is, de klant ziet het direct)</span></h3>
      </div>
      <div style={{ marginBottom: 18 }}><StrippenkaartBeheer client={client} /></div>


      <div className="two-col">
        <div>
          <h3 className="section-title">Losse taken <span className="muted small">(taken van een project staan bij dat project)</span></h3>
          <SnelleTaak clientId={client.id} />
          <div className="card flush"><TaskTable tasks={tasks.filter((t) => t.status !== 'klaar')} onOpen={setTask} showClient={false} /></div>
          {tasks.some((t) => t.status === 'klaar') && <p className="muted small">{tasks.filter((t) => t.status === 'klaar').length} afgeronde taken verborgen.</p>}

          {(client.hulpvragen ?? []).length > 0 && (
            <>
              <h3 className="section-title" style={{ marginTop: 18 }}>Berichten <span className="muted small">(uit het portaal, ook in Slack)</span></h3>
              <Hulpvragen client={client} update={update} />
            </>
          )}

          <h3 className="section-title" style={{ marginTop: 18 }}>Wat de klant moet doen <span className="muted small">(staat in het portaal, nieuwe gaan per mail)</span></h3>
          <fieldset className="kaal" disabled={!kan('klanttaken')}><KlantTaken client={client} update={update} /></fieldset>

          <h3 className="section-title" style={{ marginTop: 18 }}>Planning <span className="muted small">(ook zichtbaar voor de klant)</span></h3>
          <fieldset className="kaal" disabled={!kan('klanten_bewerken')}><Planning client={client} update={update} /></fieldset>

          {kan('geld') && (
            <>
              <h3 className="section-title" style={{ marginTop: 18 }}>Facturen <span className="muted small">(Moneybird)</span></h3>
              <KlantFacturenBlok client={client} />
              <h3 className="section-title" style={{ marginTop: 18 }}>Meta-commissie <span className="muted small">(percentage van de aankopen, ex btw)</span></h3>
              <CommissieBlok client={client} update={update} />
            </>
          )}
        </div>
        <div>
          {contact && (
            <>
              <h3 className="section-title">Contactpersonen</h3>
              <div className="card"><Contactpersonen contact={contact} /></div>
            </>
          )}

          <h3 className="section-title" style={{ marginTop: contact ? 18 : 0 }}>Gegevens</h3>
          <fieldset className="kaal" disabled={!kan('klanten_bewerken')}>
          <div className="card info-list">
            <div><span className="muted">Contact</span>{contact ? <button className="link" onClick={() => go('crm')}>{contact.name} · CRM</button> : '—'}</div>
            {contact && <MerkVelden contact={contact} onChange={(patch) => d({ type: 'contact:patch', id: contact.id, patch })} />}
            {kan('geld') && <div><span className="muted">Pakket</span><input className="inline-input" value={client.pakket} onChange={(e) => update({ pakket: e.target.value })} /></div>}
            <div><span className="muted">Frame.io</span>
              <input className="inline-input" placeholder="Deellink uit Frame.io (f.io/… mag ook)" value={client.frameUrl} onChange={(e) => update({ frameUrl: e.target.value.trim() })}
                onBlur={async (e) => {
                  // Korte f.io-link? Zet hem om naar de volledige deellink, zodat de video in het portaal ingesloten kan worden
                  const v = e.target.value.trim()
                  if (!/^https?:\/\/f\.io\//i.test(v)) return
                  const vol = await frameLinkVolledig(v)
                  if (vol) update({ frameUrl: vol })
                }} />
            </div>
            {client.frameUrl && !frameInsluitbaar(client.frameUrl) && <p className="muted small" style={{ margin: '-2px 0 0' }}>Korte f.io-links zet het dashboard bij het opslaan om naar de volledige deellink (alleen live). Lukt dat niet, plak dan de volledige link uit Frame.io (next.frame.io/share/…); anders staat er alleen een knop in het portaal.</p>}
            <div><span className="muted">Meta-account</span>
              <input className="inline-input" placeholder="act_… (resultaten in het portaal)" value={client.metaAdAccount ?? ''} onChange={(e) => update({ metaAdAccount: e.target.value.trim() || undefined })} />
            </div>
            {client.metaAdAccount && <WeekNu client={client} />}
            {client.metaAdAccount && (
              <div><span className="muted">Uitgaven</span>
                <label className="check-row inline small"><input type="checkbox" checked={client.metaUitgavenTonen !== false} onChange={(e) => update({ metaUitgavenTonen: e.target.checked })} /> Klant ziet uitgaven en kosten per resultaat</label>
              </div>
            )}
            {kan('geld') && <div><span className="muted">Moneybird</span>
              <input className="inline-input" placeholder="Contact-ID (leeg = zoeken op naam)" value={client.moneybirdContactId ?? ''} onChange={(e) => update({ moneybirdContactId: e.target.value.trim() || undefined })} />
            </div>}
            <div><span className="muted">Website</span>
              <label className="check-row inline small"><input type="checkbox" checked={client.websiteWerk === true} onChange={(e) => update({ websiteWerk: e.target.checked || undefined })} /> We doen ook de website (tabblad Google Analytics)</label>
            </div>
            {client.websiteWerk && (
              <div><span className="muted">GA4-property</span>
                <input className="inline-input" placeholder="Property-ID, bijv. 412345678" value={client.ga4PropertyId ?? ''} onChange={(e) => update({ ga4PropertyId: e.target.value.trim() || undefined })} />
              </div>
            )}
            <div><span className="muted">Volgende shoot</span>
              <input className="inline-input" type="date" value={client.nextShoot ?? ''} onChange={(e) => update({ nextShoot: e.target.value || undefined })} />
            </div>
          </div>
          </fieldset>
          {client.frameUrl && (
            <>
              <h3 className="section-title" style={{ marginTop: 18 }}>Frame.io <span className="muted small">(zo staat het ook in het portaal)</span></h3>
              <div className="card"><FrameEmbed url={client.frameUrl} /></div>
            </>
          )}
          <h3 className="section-title" style={{ marginTop: 18 }}>Contentplekken <span className="muted small">(Rise en klant kunnen links toevoegen)</span></h3>
          <fieldset className="kaal" disabled={!kan('klanttaken')}><ContentPlekken client={client} update={update} /></fieldset>

          <h3 className="section-title" style={{ marginTop: 18 }}>Toegang tot het portaal</h3>
          <fieldset className="kaal" disabled={!kan('portaaltoegang')}><Toegang client={client} update={update} /></fieldset>

          {kan('verwijderen') && (
            <button className="link small danger" style={{ marginTop: 18 }} onClick={() => {
              if ((client.logins ?? []).length) return window.alert(`${client.name} heeft nog portaaltoegang (${client.logins!.join(', ')}). Haal die eerst weg voordat je het klantprofiel verwijdert.`)
              if (!window.confirm(`Klantprofiel van ${client.name} verwijderen? Onboarding, planning, bestanden en contentplekken gaan weg. Het contact in het CRM en de taken blijven bestaan.`)) return
              if (window.prompt(`Typ de naam van de klant (${client.name}) om te bevestigen.`)?.trim().toLowerCase() !== client.name.trim().toLowerCase()) return
              d({ type: 'weg', table: 'clients', id: client.id })
              go('crm')
            }}>Klantprofiel verwijderen…</button>
          )}
        </div>
      </div>

      <div className="section-row" id="contentkalender" style={{ marginTop: 24 }}>
        <h3 className="section-title">Contentkalender <span className="muted small">(mails en posts per maand, ook in het portaal en de Planning)</span></h3>
      </div>
      <div className="card" style={{ marginBottom: 18 }}>
        <ContentKalender client={client} update={kan('klanten_bewerken') ? update : undefined} openId={contentItem} />
      </div>
      {task && <TaskDrawer key={task.id} task={task} onClose={() => setTask(null)} />}
    </>
  )
}

type Update = (patch: Partial<Client>) => void
/** Alles met een traject: een klant (algemeen) of een project. */
export type MetTraject = { name: string; phases?: Phase[]; doneSteps: string[]; phase: number }
export type TrajectPatch = { phases?: Phase[]; doneSteps?: string[]; phase?: number }

type ConceptStap = { id: string; text: string; /** Oorspronkelijke tekst, om het vinkje mee te nemen bij hernoemen. */ orig?: string }
type ConceptFase = Omit<Phase, 'steps'> & { steps: ConceptStap[] }
const naarConcept = (f: Phase[]): ConceptFase[] => f.map((p) => ({ ...p, steps: p.steps.map((st) => ({ id: uid(), text: st, orig: st })) }))

/** Fasen en stappen per klant aanpassen: hernoemen, toevoegen, verwijderen, verplaatsen, of beginnen met een sjabloon. */
function FasenEditor({ client, update, onClose }: { client: MetTraject; update: (patch: TrajectPatch) => void; onClose: (fase?: number) => void }) {
  const [fasen, setFasen] = useState<ConceptFase[]>(() => naarConcept(fasenVan(client)))
  const zet = (i: number, patch: Partial<ConceptFase>) => setFasen(fasen.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const zetStap = (i: number, k: number, text: string) => zet(i, { steps: fasen[i].steps.map((st, j) => (j === k ? { ...st, text } : st)) })
  const nieuweStap = (i: number, na = fasen[i].steps.length - 1) => {
    const steps = [...fasen[i].steps]
    steps.splice(na + 1, 0, { id: uid(), text: '' })
    zet(i, { steps })
  }
  const verplaats = (i: number, r: -1 | 1) => {
    const n = [...fasen]
    ;[n[i], n[i + r]] = [n[i + r], n[i]]
    setFasen(n)
  }
  // Slepen: stappen (ook naar een andere fase) en hele fasen op volgorde zetten
  const [sleep, setSleep] = useState<{ fase: number; stap?: number } | null>(null)
  const [doel, setDoel] = useState<string | null>(null)
  const zetNeer = (fase: number, stap?: number) => {
    if (!sleep) return
    const n = fasen.map((f) => ({ ...f, steps: [...f.steps] }))
    if (sleep.stap === undefined) {
      // fase verslepen
      if (sleep.fase === fase) return
      const [f] = n.splice(sleep.fase, 1)
      n.splice(fase, 0, f)
    } else {
      const [st] = n[sleep.fase].steps.splice(sleep.stap, 1)
      let plek = stap ?? n[fase].steps.length
      if (sleep.fase === fase && stap !== undefined && sleep.stap < stap) plek -= 1
      n[fase].steps.splice(plek, 0, st)
    }
    setFasen(n)
    setSleep(null)
    setDoel(null)
  }
  const sleepProps = (fase: number, stap?: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; setSleep({ fase, stap }) },
    onDragEnd: () => { setSleep(null); setDoel(null) },
  })
  const doelProps = (id: string, fase: number, stap?: number, alleenFase = false) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!sleep || (alleenFase && sleep.stap !== undefined) || (!alleenFase && sleep.stap === undefined && stap !== undefined)) return
      e.preventDefault(); e.stopPropagation(); if (doel !== id) setDoel(id)
    },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); zetNeer(fase, stap) },
  })
  const sjabloon = (naam: string) => {
    const t = TRAJECTEN.find((x) => x.naam === naam)
    if (t && confirm(`De fasen vervangen door het sjabloon "${naam}"? Daarna kun je nog alles aanpassen. Er wordt pas iets opgeslagen als je op Opslaan klikt.`)) setFasen(naarConcept(t.fasen))
  }
  const opslaan = () => {
    const schoon = fasen
      .map((f) => ({ ...f, label: f.label.trim(), klantLabel: f.klantLabel.trim() || f.label.trim(), steps: f.steps.filter((st) => st.text.trim()) }))
      .filter((f) => f.label)
    if (!schoon.length) return alert('Er moet minstens één fase met een naam overblijven.')
    const nieuw: Phase[] = schoon.map((f) => ({ key: f.key, label: f.label, klantLabel: f.klantLabel, steps: f.steps.map((st) => st.text.trim()) }))
    // Vinkjes gaan mee met een hernoemde stap; stappen die weg zijn verliezen hun vinkje
    const doneSteps = Array.from(new Set(schoon.flatMap((f) => f.steps.filter((st) => st.orig && client.doneSteps.includes(st.orig)).map((st) => st.text.trim()))))
    // De klant blijft in dezelfde fase staan, ook als er fasen zijn verplaatst of weggehaald
    const plek = nieuw.findIndex((f) => f.key === faseVan(client).key)
    const phase = plek >= 0 ? plek : Math.min(client.phase, nieuw.length - 1)
    update({ phases: nieuw, doneSteps, phase })
    onClose(phase)
  }

  return (
    <div className="card fasen-editor">
      <div className="fasen-kop">
        <h3 className="section-title" style={{ margin: 0 }}>Fasen en stappen voor {client.name}</h3>
        <select value="" onChange={(e) => sjabloon(e.target.value)}>
          <option value="">Begin met een sjabloon…</option>
          {TRAJECTEN.map((t) => <option key={t.naam} value={t.naam}>{t.naam}</option>)}
        </select>
      </div>
      <p className="muted small">De eerste fase is de onboarding: de klant ziet die stappen als checklist in het portaal. Van de andere fasen ziet de klant alleen de tekst bij "Wat de klant ziet".</p>
      {fasen.map((f, i) => (
        <div key={f.key} className={`fase-edit ${sleep?.fase === i && sleep.stap === undefined ? 'sleept' : ''} ${doel === `f${i}` ? 'doel' : ''}`} {...doelProps(`f${i}`, i, undefined, sleep?.stap === undefined)} onDrop={(e) => { e.preventDefault(); zetNeer(i) }}>
          <div className="fase-edit-kop">
            <span className="sleep-greep" title="Sleep om de fase te verplaatsen" {...sleepProps(i)}>⋮⋮</span>
            <span className="fase-nr">{i + 1}</span>
            <input value={f.label} placeholder="Naam van de fase" onChange={(e) => zet(i, { label: e.target.value })} autoFocus={!f.label} />
            <input value={f.klantLabel} placeholder="Wat de klant ziet" onChange={(e) => zet(i, { klantLabel: e.target.value })} />
            <button className="icon-btn" aria-label="Fase omhoog" disabled={i === 0} onClick={() => verplaats(i, -1)}>↑</button>
            <button className="icon-btn" aria-label="Fase omlaag" disabled={i === fasen.length - 1} onClick={() => verplaats(i, 1)}>↓</button>
            <button className="icon-btn" aria-label="Fase verwijderen" disabled={fasen.length === 1} onClick={() => confirm(`Fase "${f.label || 'zonder naam'}" met ${f.steps.length} stappen weghalen?`) && setFasen(fasen.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
          </div>
          <ul className="fase-edit-stappen">
            {f.steps.map((st, k) => (
              <li key={st.id} className={`${sleep?.fase === i && sleep.stap === k ? 'sleept' : ''} ${doel === `s${i}-${k}` ? 'doel' : ''}`} {...doelProps(`s${i}-${k}`, i, k)}>
                <span className="sleep-greep" title="Sleep om de stap te verplaatsen" {...sleepProps(i, k)}>⋮⋮</span>
                <span className="muted">○</span>
                <input value={st.text} placeholder="Stap" autoFocus={!st.orig && !st.text} onChange={(e) => zetStap(i, k, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && nieuweStap(i, k)} />
                <button className="icon-btn" aria-label="Stap verwijderen" onClick={() => zet(i, { steps: f.steps.filter((_, j) => j !== k) })}><Icon name="x" size={13} /></button>
              </li>
            ))}
          </ul>
          {sleep?.stap !== undefined && <div className={`stap-neerzet ${doel === `e${i}` ? 'doel' : ''}`} {...doelProps(`e${i}`, i)}>Hier neerzetten</div>}
          <button className="link small" onClick={() => nieuweStap(i)}>+ Stap</button>
        </div>
      ))}
      <div className="fasen-voet">
        <button className="btn ghost" onClick={() => setFasen([...fasen, { key: uid(), label: '', klantLabel: '', steps: [] }])}><Icon name="plus" size={14} /> Fase</button>
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={() => onClose()}>Annuleren</button>
        <button className="btn primary" onClick={opslaan}>Opslaan</button>
      </div>
    </div>
  )
}

/** Drive-mappen, Google Docs, pdf's en brand guidelines per klant, op één plek. */
function Links({ client, update }: { client: Client; update: Update }) {
  const kan = useMag()
  const { s } = useStore()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [klant, setKlant] = useState(true)
  const links = client.links ?? []
  const add = () => {
    if (!url.trim()) return
    const u = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    update({ links: [{ id: uid(), title: title.trim() || u.replace(/^https?:\/\//, '').slice(0, 60), url: u, klant, at: new Date().toISOString(), by: s.me }, ...links] })
    setTitle('')
    setUrl('')
  }
  return (
    <div className="card">
      {links.length === 0 && <LeegStaat icon="note" titel="Nog geen bestanden of links" tekst="Plak hieronder de link naar brand guidelines, een Google Doc of een pdf." />}
      {links.map((l) => (
        <div key={l.id} className="link-row">
          <Icon name="external" size={15} />
          <span className="list-main"><a href={l.url} target="_blank" rel="noreferrer">{l.title}</a><span className="muted small">{l.klant ? 'Ook in het portaal' : 'Alleen intern'} · {fmtDate(l.at.slice(0, 10))}</span></span>
          <button className="link small" onClick={() => update({ links: links.map((x) => (x.id === l.id ? { ...x, klant: !x.klant } : x)) })}>{l.klant ? 'Verberg voor klant' : 'Toon aan klant'}</button>
          {kan('verwijderen') && <button className="icon-btn" aria-label="Verwijderen" onClick={() => confirm(`"${l.title}" verwijderen?`) && update({ links: links.filter((x) => x.id !== l.id) })}><Icon name="x" size={14} /></button>}
        </div>
      ))}
      <div className="link-add">
        <input placeholder="Naam (bijv. Brand guidelines)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="Link plakken" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <label className="check-row inline small"><input type="checkbox" checked={klant} onChange={(e) => setKlant(e.target.checked)} /> Klant ziet het</label>
        <button className="btn small" onClick={add} disabled={!url.trim()}>Toevoegen</button>
      </div>
    </div>
  )
}

/** Berichten van de klant uit het portaal, nieuwste bovenaan. Geen tickets: antwoorden gaat per mail of telefoon. */
function Hulpvragen({ client }: { client: Client; update: Update }) {
  const vragen = [...(client.hulpvragen ?? [])].sort((a, b) => b.at.localeCompare(a.at))
  const [alles, setAlles] = useState(false)
  return (
    <div className="card">
      {(alles ? vragen : vragen.slice(0, 5)).map((v) => (
        <div key={v.id} className="link-row hulpvraag">
          <span className="list-main"><span className="hulpvraag-tekst">{v.tekst}</span><span className="muted small">{v.email ? <a href={`mailto:${v.email}`}>{v.email}</a> : 'klant'} · {fmtDate(v.at.slice(0, 10))}</span></span>
        </div>
      ))}
      {vragen.length > 5 && <button className="link small" onClick={() => setAlles(!alles)}>{alles ? 'Minder tonen' : `Alle ${vragen.length} berichten`}</button>}
    </div>
  )
}

/**
 * Waar de content van de klant staat (Drive, SharePoint, Frame.io…). Meerdere links mogelijk.
 * Weghalen kan alleen via "Beheren" en daarna nog een bevestiging, zodat er niet per ongeluk een link verdwijnt.
 */
function ContentPlekken({ client, update }: { client: Client; update: Update }) {
  const kan = useMag()
  const { s } = useStore()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [beheren, setBeheren] = useState(false)
  const [wegId, setWegId] = useState<string | null>(null)
  const plekken = client.contentPlekken ?? []
  const add = () => {
    if (!url.trim()) return
    const u = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    update({ contentPlekken: [...plekken, { id: uid(), title: title.trim() || bronVan(u), url: u, door: 'rise', by: s.me, at: new Date().toISOString() }] })
    setTitle(''); setUrl('')
  }
  const weg = (p: ContentPlek) => { update({ contentPlekken: plekken.filter((x) => x.id !== p.id) }); setWegId(null) }
  return (
    <div className="card">
      {client.frameUrl && (
        <div className="link-row"><Icon name="play" size={15} /><span className="list-main"><a href={client.frameUrl} target="_blank" rel="noreferrer">Frame.io (video's)</a><span className="muted small">deellink uit de gegevens</span></span></div>
      )}
      {plekken.length === 0 && !client.frameUrl && <LeegStaat icon="image" titel="Nog geen contentplek" tekst="Zet hieronder de Drive-map, SharePoint of Dropbox. De klant kan er in het portaal ook zelf een toevoegen." />}
      {plekken.map((p) => (
        <div key={p.id} className="link-row contentplek">
          <Icon name="external" size={15} />
          <span className="list-main"><a href={p.url} target="_blank" rel="noreferrer">{p.title}</a><span className="muted small">{bronVan(p.url) !== p.title ? `${bronVan(p.url)} · ` : ''}{p.door === 'klant' ? `toegevoegd door de klant${p.email ? ` (${p.email})` : ''}` : `toegevoegd door ${p.by ? personName(p.by) : 'Rise'}`} · {fmtDate(p.at.slice(0, 10))}</span></span>
          {beheren && wegId !== p.id && <button className="link small danger" onClick={() => setWegId(p.id)}>Weghalen…</button>}
          {wegId === p.id && (
            <span className="weg-bevestig">
              <span className="small">Link weghalen, ook bij de klant?</span>
              <button className="btn small danger" onClick={() => weg(p)}>Ja, weghalen</button>
              <button className="btn small ghost" onClick={() => setWegId(null)}>Nee</button>
            </span>
          )}
        </div>
      ))}
      <div className="link-add" style={{ gridTemplateColumns: '1fr 1.4fr auto' }}>
        <input placeholder="Naam (bijv. Shootdag december)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="Link naar de map plakken" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn small" onClick={add} disabled={!url.trim()}>Toevoegen</button>
      </div>
      {plekken.length > 0 && (
        <p className="muted small" style={{ marginBottom: 0 }}>
          Staat ook in het portaal onder "Je content". {kan('verwijderen') && <button className="link small" onClick={() => { setBeheren(!beheren); setWegId(null) }}>{beheren ? 'Klaar met beheren' : 'Beheren'}</button>}
        </p>
      )}
    </div>
  )
}

/** Taken die de klant zelf moet doen. Staan in het portaal; nieuwe taken gaan na een half uur gebundeld in één mail. */
function KlantTaken({ client, update }: { client: Client; update: Update }) {
  const kan = useMag()
  const { s } = useStore()
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [description, setDescription] = useState('')
  const taken = client.klantTaken ?? []
  const open = taken.filter((t) => !t.done)
  const klaar = taken.filter((t) => t.done)
  const add = () => {
    if (!title.trim()) return
    update({ klantTaken: [...taken, { id: uid(), title: title.trim(), description: description.trim() || undefined, deadline: deadline || undefined, done: false, createdAt: new Date().toISOString(), by: s.me }] })
    setTitle(''); setDeadline(''); setDescription('')
  }
  const zet = (id: string, done: boolean) => update({ klantTaken: taken.map((t) => (t.id === id ? { ...t, done, doneAt: done ? new Date().toISOString() : undefined } : t)) })
  const nieuw = (t: { createdAt: string }) => Date.now() - new Date(t.createdAt).getTime() < 30 * 60_000
  return (
    <div className="card">
      {taken.length === 0 && <LeegStaat icon="check" titel="Nog niets nodig van de klant" tekst={'Bijvoorbeeld "Content aanleveren" of "Toegang geven tot LinkedIn". Typ hieronder.'} />}
      {open.map((t) => (
        <div key={t.id} className="link-row klanttaak">
          <input type="checkbox" checked={false} onChange={() => zet(t.id, true)} title="Op gedaan zetten" />
          <span className="list-main">{t.title}<span className="muted small">{[t.deadline && `graag vóór ${fmtDate(t.deadline)}`, nieuw(t) ? 'gaat binnen een half uur mee in de mail' : 'staat in het portaal', t.description].filter(Boolean).join(' · ')}</span></span>
          {kan('verwijderen') && <button className="icon-btn" aria-label="Verwijderen" onClick={() => confirm(`"${t.title}" weghalen bij de klant?`) && update({ klantTaken: taken.filter((x) => x.id !== t.id) })}><Icon name="x" size={14} /></button>}
        </div>
      ))}
      {klaar.map((t) => (
        <div key={t.id} className="link-row klanttaak klaar">
          <input type="checkbox" checked onChange={() => zet(t.id, false)} title="Weer open zetten" />
          <span className="list-main">{t.title}<span className="muted small">gedaan{t.doneAt ? ` op ${fmtDate(t.doneAt.slice(0, 10))}` : ''}</span></span>
        </div>
      ))}
      <div className="link-add" style={{ gridTemplateColumns: '1fr auto auto' }}>
        <input placeholder="Wat moet de klant doen? (bijv. Content aanleveren)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <input type="date" title="Graag vóór" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <button className="btn small" onClick={add} disabled={!title.trim()}>Toevoegen</button>
      </div>
      {title.trim() && <input className="klanttaak-uitleg" placeholder="Toelichting voor de klant (optioneel)" value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />}
      <p className="muted small" style={{ marginBottom: 0 }}>
        {(client.logins ?? []).length
          ? `Nieuwe taken gaan een half uur na de eerste in één mail naar ${(client.logins ?? []).filter((e) => !(client.mailUit ?? []).includes(e)).join(', ') || 'niemand (iedereen heeft zich afgemeld)'}.`
          : 'Nog niemand van de klant heeft portaaltoegang, dus er gaat nog geen mail uit. Geef eerst toegang hieronder.'}
        {(client.mailUit ?? []).length > 0 && ` Afgemeld voor taakmails: ${(client.mailUit ?? []).join(', ')} (zien de taken wel in het portaal).`}
      </p>
    </div>
  )
}

/** Planning die de klant in het portaal ziet: shootdagen, livegang, opleveringen. */
function Planning({ client, update }: { client: Client; update: Update }) {
  const kan = useMag()
  const [date, setDate] = useState('')
  const [title, setTitle] = useState('')
  const items = [...(client.planning ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const today = new Date().toISOString().slice(0, 10)
  const add = () => {
    if (!date || !title.trim()) return
    update({ planning: [...items, { id: uid(), date, title: title.trim() }] })
    setDate('')
    setTitle('')
  }
  return (
    <div className="card">
      {items.length === 0 && <LeegStaat icon="calendar" titel="Nog geen planning" tekst="Zet hieronder de shootdag, de livegang en andere vaste momenten." />}
      <ul className="plan-list">
        {items.map((p) => (
          <li key={p.id} className={p.date < today ? 'past' : ''}>
            <span className="plan-date">{fmtDate(p.date)}</span>
            <span className="list-main">{p.title}</span>
            {kan('verwijderen') && <button className="icon-btn" aria-label="Verwijderen" onClick={() => update({ planning: items.filter((x) => x.id !== p.id) })}><Icon name="x" size={14} /></button>}
          </li>
        ))}
      </ul>
      <div className="link-add" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input placeholder="Wat gebeurt er? (bijv. Shootdag, Ads live)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn small" onClick={add} disabled={!date || !title.trim()}>Toevoegen</button>
      </div>
    </div>
  )
}

/** Wie van de klant mag inloggen op app.risevideomarketing.nl (alleen het eigen portaal). */
function Toegang({ client, update }: { client: Client; update: Update }) {
  const { s } = useStore()
  const [email, setEmail] = useState('')
  const [naam, setNaam] = useState('')
  const [msg, setMsg] = useState('')
  const logins = client.logins ?? []
  const add = async () => {
    const e = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return setMsg('Dat is geen geldig mailadres.')
    setMsg('Bezig…')
    const res = s.live ? await giveAccess(client.id, e, naam.trim()) : { ok: true, text: 'Lokaal: alleen opgeslagen, er is nog geen account aangemaakt.' }
    if (!res.ok) return setMsg(res.text)
    update({ logins: Array.from(new Set([...logins, e])) })
    setEmail('')
    setNaam('')
    setMsg(res.text || `${e} kan nu inloggen op app.risevideomarketing.nl met een code uit de mail.`)
  }
  return (
    <div className="card">
      {logins.length === 0 && <p className="muted small" style={{ margin: 0 }}>Nog niemand van de klant heeft toegang.</p>}
      {logins.map((l) => <div key={l} className="link-row"><Icon name="lock" size={14} /><span className="list-main">{l}</span></div>)}
 <div className="link-add" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
        <input placeholder="Naam (voor de welkomstmail)" value={naam} onChange={(e) => setNaam(e.target.value)} />
        <input type="email" placeholder="Mailadres van de klant" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn small" onClick={add} disabled={!email.trim()}>Geef toegang</button>
      </div>
      {msg && <p className="muted small">{msg}</p>}
      <p className="muted small" style={{ marginBottom: 0 }}>De klant krijgt een persoonlijke welkomstmail en logt in op app.risevideomarketing.nl met een code uit de mail en ziet alleen het eigen portaal: voortgang, planning, content, bestanden en de kennisbank. Nooit taken, CRM of bedragen.</p>
    </div>
  )
}

/** Weekoverzicht direct maken (anders elke maandag om 07:00), bijv. net na het koppelen van het advertentieaccount. */
function WeekNu({ client }: { client: Client }) {
  const { s } = useStore()
  const [msg, setMsg] = useState('')
  const maak = async () => {
    if (!s.live) return setMsg('Lokaal niet mogelijk; na de livegang maakt dit het weekoverzicht van vorige week.')
    setMsg('Bezig…')
    const r = await weekoverzichtNu(client.id)
    setMsg('fout' in r ? r.fout : `Klaar: week van ${r.overzicht.van} staat in het portaal.`)
  }
  return (
    <div><span className="muted">Weekoverzicht</span>
      <span>{msg ? <span className="muted small">{msg}</span> : <span className="muted small">elke maandag 07:00</span>}<button className="link small" onClick={maak}>Nu maken</button></span>
    </div>
  )
}

/** Productiefase op het bord (en de status in het portaal) afgeleid van de fase in het traject. */
const BORD_FASE: Record<string, 'productie' | 'filmen' | 'edit1' | 'edit2' | 'feedback' | 'live'> = { kennismaking: 'productie', voorstel: 'productie', preproductie: 'productie', opnames: 'filmen', montage: 'edit1', feedback: 'edit2', oplevering: 'live' }
export const bordFase = (fasen: Phase[], i: number) => {
  const k = fasen[i]?.key
  if (k && BORD_FASE[k]) return BORD_FASE[k]
  const r = fasen.length > 1 ? i / (fasen.length - 1) : 0
  return r < 0.4 ? 'productie' : r < 0.55 ? 'filmen' : r < 0.7 ? 'edit1' : r < 1 ? 'edit2' : 'live'
}
const dienstVan = (p: Project) => (p.notities ?? '').match(/Dienst: (.+)/)?.[1]?.trim()

/** Traject van een project; bestaande projecten zonder eigen traject erven dat van de klant (als het het enige project is) of het sjabloon van hun dienst. */
export function trajectVan(p: Project, client: Client | undefined, enige: boolean): MetTraject {
  if (p.phases?.length) return { name: p.name, phases: p.phases, doneSteps: p.doneSteps ?? [], phase: p.phase ?? 0 }
  if (enige && client?.phases?.length) return { name: p.name, phases: client.phases, doneSteps: client.doneSteps, phase: client.phase }
  const sjabloon = TRAJECTEN.find((t) => t.naam === dienstVan(p))?.fasen ?? PHASES
  return { name: p.name, phases: sjabloon, doneSteps: p.doneSteps ?? [], phase: p.phase ?? 0 }
}

/** Bovenaan het dossier: de projecten van deze klant als compacte kaarten. Het traject, de taken en bestanden staan op de projectpagina. */
function ProjectTrajecten({ client, go }: { client: Client; go: (r: string) => void }) {
  const { s, d } = useStore()
  const kan = useMag()
  const lijst = s.projects.filter((p) => p.soort === 'productie' && p.clientId === client.id).sort((a, b) => Number(a.fase === 'live') - Number(b.fase === 'live') || (a.deadline ?? '9').localeCompare(b.deadline ?? '9'))
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [naam, setNaam] = useState('')
  const [dienst, setDienst] = useState('')
  const nieuw = () => {
    if (!naam.trim()) return
    const id = uid()
    const fasen = TRAJECTEN.find((t) => t.naam === dienst)?.fasen ?? PHASES
    d({ type: 'project:upsert', project: { id, name: naam.trim(), soort: 'productie', clientId: client.id, fase: 'productie', contentSoort: 'video', priority: 'middel', wie: [s.me], createdAt: new Date().toISOString(), updates: [], phases: fasen, doneSteps: [], phase: 0 } })
    go(`productie/${id}`)
  }
  // Offertes (alleen het team) staan in een eigen tab; slepen naar "Lopende projecten" maakt er een project van
  const store = useStore()
  const contact = s.contacts.find((c) => c.id === client.contactId)
  const nOffertes = (contact?.deals ?? []).filter((x) => !(x.projectId && s.projects.some((p) => p.id === x.projectId))).length
  const [tab, setTab] = useState<'projecten' | 'offertes'>('projecten')
  const [boven, setBoven] = useState(false)
  const naarProject = (dealId: string) => {
    const c = s.contacts.find((x) => x.id === client.contactId)
    if (!c) return
    const oud = c.deals ?? []
    const al = oud.find((x) => x.id === dealId)?.projectId
    const id = offerteNaarProject(store, client, c, dealId)
    if (!id) return
    setTab('projecten')
    if (id !== al) metOngedaan('Offerte staat nu bij lopende projecten', () => { d({ type: 'weg', table: 'projects', id }); d({ type: 'contact:patch', id: c.id, patch: { deals: oud, stage: c.stage } }) })
  }
  const dropProps = {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('text/rise-offerte')) { e.preventDefault(); setBoven(true) } },
    onDragLeave: () => setBoven(false),
    onDrop: (e: React.DragEvent) => { const id = e.dataTransfer.getData('text/rise-offerte'); setBoven(false); if (id) { e.preventDefault(); naarProject(id) } },
  }
  return (
    <div className="card traject-kaart">
      <div className="section-row dossier-tabs-rij" style={{ marginTop: 0 }}>
        <div className="dossier-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'projecten'} className={`dossier-tab ${tab === 'projecten' ? 'on' : ''} ${boven ? 'boven' : ''}`} onClick={() => setTab('projecten')} {...dropProps}>Lopende projecten <span className="muted small">({lijst.length})</span></button>
          {kan('crm') && <button role="tab" aria-selected={tab === 'offertes'} className={`dossier-tab ${tab === 'offertes' ? 'on' : ''}`} onClick={() => setTab('offertes')}>Offertes <span className="muted small">({nOffertes})</span></button>}
        </div>
        {tab === 'projecten' && kan('projecten') && <button className="btn small primary" onClick={() => setNieuwOpen(!nieuwOpen)}><Icon name="plus" size={14} /> Project</button>}
      </div>
      {tab === 'offertes' ? <OffertesTab client={client} onNaarProject={naarProject} /> : <div className={`projecten-drop ${boven ? 'boven' : ''}`} {...dropProps}>
      {nieuwOpen && (
        <div className="nieuw-project">
          <input autoFocus placeholder={`Naam, bijv. "Strijkviertel videoproductie"`} value={naam} onChange={(e) => setNaam(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') nieuw(); if (e.key === 'Escape') setNieuwOpen(false) }} />
          <select value={dienst} onChange={(e) => setDienst(e.target.value)}><option value="">Traject: standaard</option>{TRAJECTEN.map((t) => <option key={t.naam} value={t.naam}>{t.naam}</option>)}</select>
          <button className="btn small primary" disabled={!naam.trim()} onClick={nieuw}>Aanmaken</button>
        </div>
      )}
      {lijst.length === 0 && !nieuwOpen && <p className="muted" style={{ margin: 0 }}>Nog geen project voor {client.name}. Elk project krijgt zijn eigen traject, taken en bestanden.</p>}
      <div className="dossier-projecten">
        {lijst.map((p) => {
          const t = trajectVan(p, client, lijst.length === 1)
          const f = fasenVan(t)
          const open = s.tasks.filter((x) => x.projectId === p.id && x.status !== 'klaar').length
          const klaar = p.fase === 'live' || t.phase >= f.length - 1 && faseVan(t).steps.every((st) => t.doneSteps.includes(st))
          return (
            <button key={p.id} className={`dossier-project ${klaar ? 'klaar' : ''}`} onClick={() => go(`productie/${p.id}`)}>
              <strong>{p.name}</strong>
              <span className="muted small">{klaar ? 'Opgeleverd' : `${faseVan(t).label} · fase ${Math.min(t.phase + 1, f.length)} van ${f.length}`}</span>
              <span className="mini-bar"><i style={{ width: `${((Math.min(t.phase, f.length - 1) + (klaar ? 1 : 0)) / f.length) * 100}%` }} /></span>
              <span className="muted small">{[p.deadline ? `af vóór ${fmtDate(p.deadline)}` : null, open ? `${open} open ${open === 1 ? 'taak' : 'taken'}` : 'geen open taken'].filter(Boolean).join(' · ')}</span>
            </button>
          )
        })}
      </div>
      </div>}
    </div>
  )
}

/** Stepper met checklist van één traject. */
export function TrajectKaart({ doel, update, kanBewerken, kop }: { doel: MetTraject; update: (patch: TrajectPatch) => void; kanBewerken: boolean; kop: React.ReactNode }) {
  const fasen = fasenVan(doel)
  const [view, setView] = useState(Math.min(doel.phase, fasen.length - 1))
  const [bewerken, setBewerken] = useState(false)
  const phase = fasen[Math.min(view, fasen.length - 1)]
  const toggle = (step: string) => update({ doneSteps: doel.doneSteps.includes(step) ? doel.doneSteps.filter((x) => x !== step) : [...doel.doneSteps, step] })
  const allDone = faseVan(doel).steps.every((st) => doel.doneSteps.includes(st))
  if (bewerken) return <FasenEditor client={doel} update={update} onClose={(fase) => { setBewerken(false); if (fase !== undefined) setView(fase) }} />
  return (
    <>
      <div className="fasen-kop">
        {kop}
        {kanBewerken && <button className="link small" onClick={() => setBewerken(true)}>Fasen en stappen aanpassen</button>}
      </div>
      <ol className="stepper">
        {fasen.map((p, i) => (
          <li key={p.key + i} className={`${i < doel.phase ? 'done' : ''} ${i === doel.phase ? 'current' : ''} ${i === view ? 'viewing' : ''}`} onClick={() => setView(i)}>
            <span className="dot">{i < doel.phase ? <Icon name="check" size={13} /> : i + 1}</span>
            <span className="step-label">{p.label}</span>
          </li>
        ))}
      </ol>
      <div className="phase-panel">
        <div>
          <h3 className="section-title">{phase.label}{view === doel.phase && <span className="badge status-bezig">Huidige fase</span>}</h3>
          <ul className="checklist">
            {phase.steps.map((st) => <li key={st}><label><input type="checkbox" checked={doel.doneSteps.includes(st)} onChange={() => toggle(st)} /> {st}</label></li>)}
            {phase.steps.length === 0 && <li className="muted small">Geen stappen in deze fase.</li>}
          </ul>
        </div>
        <div className="phase-actions">
          {doel.phase > 0 && <button className="btn ghost" onClick={() => { update({ phase: doel.phase - 1 }); setView(doel.phase - 1) }}>← Vorige fase</button>}
          {doel.phase < fasen.length - 1 && (
            <button className={`btn ${allDone ? 'primary' : ''}`} onClick={() => { update({ phase: doel.phase + 1 }); setView(doel.phase + 1) }}>
              Naar {fasen[doel.phase + 1].label} →
            </button>
          )}
          {!allDone && <p className="muted small">Nog niet alle stappen van {faseVan(doel).label.toLowerCase()} afgevinkt.</p>}
        </div>
      </div>
    </>
  )
}

/** Facturen van deze klant uit Moneybird (zonder concepten), zoals de klant ze in het portaal ziet. */
function KlantFacturenBlok({ client }: { client: Client }) {
  const { s } = useStore()
  const [data, setData] = useState<{ facturen: KlantFactuur[]; contact?: { id: string; naam?: string } | null; gekoppeld: boolean } | { fout: string } | null | 'laden'>('laden')
  useEffect(() => {
    if (!s.live) return setData(null)
    let stop = false
    klantFacturen(client.id).then((r) => { if (!stop) setData(r) })
    return () => { stop = true }
  }, [s.live, client.id, client.moneybirdContactId])
  if (data === 'laden') return <div className="card"><p className="muted small" style={{ margin: 0 }}>Facturen laden…</p></div>
  if (!data) return <div className="card"><p className="muted small" style={{ margin: 0 }}>Lokaal zijn er geen facturen; live komen ze uit Moneybird.</p></div>
  if ('fout' in data) return <div className="card"><p className="small danger-tekst" style={{ margin: 0 }}>{data.fout}</p></div>
  if (!data.gekoppeld) return <div className="card"><p className="muted small" style={{ margin: 0 }}>Moneybird is niet gekoppeld.</p></div>
  if (!data.contact) return <div className="card"><p className="muted small" style={{ margin: 0 }}>Geen Moneybird-contact gevonden voor {client.name}. Vul het contact-ID in bij Gegevens.</p></div>
  return (
    <div className="card flush">
      {data.facturen.length === 0 && <p className="muted small" style={{ padding: '12px 16px', margin: 0 }}>Nog geen verstuurde facturen.</p>}
      {data.facturen.map((f) => (
        <a key={f.nummer} className="project-taak project-rij" href={f.url} target="_blank" rel="noreferrer">
          <span className="project-taak-titel"><span>{f.nummer}</span><span className="muted small">{f.datum ? fmtDate(f.datum) : ''}{f.openstaand > 0 && f.status !== 'betaald' ? ` · open ${euro(f.openstaand)}` : ''}</span></span>
          <span className="small strong">{euro(f.bedrag)}</span>
          <span className={`badge ${f.status === 'betaald' ? 'status-klaar' : f.status === 'te laat' ? 'prio-hoog' : 'status-bezig'}`}>{f.status === 'betaald' ? 'Betaald' : f.status === 'te laat' ? 'Te laat' : 'Open'}</span>
        </a>
      ))}
    </div>
  )
}

