import { metOngedaan } from '../components/Ongedaan'
import { useEffect, useRef, useState } from 'react'
import { MerkLogo, MerkVelden } from '../components/Logo'
import { TaskDrawer, newTask } from '../components/TaskDrawer'
import { Avatar, DemoNote, Drawer, Icon, PageHead, Segmented, personName } from '../components/ui'
import { ALLE_STAGES, PHASES, STAGES, TEAM, TRAJECTEN, faseVan, isKlant, pipelineItems, type PipelineItem } from '../data/mock'
import type { Client, Contact, Contactpersoon, Deal, PersonId, Stage, Task, TimelineKind } from '../data/types'
import { uid, useMag, useStore } from '../store'
import { alleOffertes, type Offerte } from '../slack'
import { bezigMet, euro, fmtDate, fmtDateTime, laatstBezig, slug, standaardAfVoor } from '../utils'
import { TaskTable } from './Taken'

/** Opvolgdatum, met jaartal (de meeste liggen maanden vooruit). */
const opvolgDatum = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

const KIND: Record<TimelineKind, { icon: string; label: string }> = {
  'mail-in': { icon: 'mail', label: 'Mail ontvangen' },
  'mail-uit': { icon: 'mail', label: 'Mail verstuurd' },
  whatsapp: { icon: 'chat', label: 'WhatsApp' },
  notitie: { icon: 'note', label: 'Notitie' },
  gesprek: { icon: 'phone', label: 'Gesprek' },
}

/** Taken die bij een contact horen: direct, of via het klantprofiel en de producties van die klant. */
export function takenVanContact(s: ReturnType<typeof useStore>['s'], contact: Contact): Task[] {
  const client = s.clients.find((c) => c.contactId === contact.id)
  return s.tasks.filter((t) => t.contactId === contact.id || (client && t.clientId === client.id))
}

export function Crm({ go, weergave = 'pipeline' }: { go: (r: string) => void; weergave?: 'pipeline' | 'contacten' | 'offertes' }) {
  const { s, d } = useStore()
  const kan = useMag()
  const [drag, setDrag] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [nieuw, setNieuw] = useState<{ stage: Stage; clientId?: string } | null>(null)
  const nieuwIn = nieuw?.stage ?? null
  const setNieuwIn = (st: Stage | null) => setNieuw(st ? { stage: st } : null)
  const open = s.contacts.find((c) => c.id === openId) ?? null

  /** Akkoord op een opdracht van een klant met dossier: er komt meteen een project in het dossier (één per offerte). */
  const projectBijAkkoord = (contactId: string, deal: Deal): Deal => {
    const client = s.clients.find((x) => x.contactId === contactId)
    if (!client || deal.projectId || !isKlant(deal.stage)) return deal
    const id = uid()
    const fasen = TRAJECTEN.find((t) => t.naam === deal.dienst || t.naam === deal.titel)?.fasen ?? PHASES
    d({ type: 'project:upsert', project: { id, name: deal.titel || 'Nieuw project', soort: 'productie', clientId: client.id, fase: 'productie', contentSoort: 'video', priority: 'middel', bedrag: deal.value || undefined, wie: [deal.owner ?? s.me], createdAt: new Date().toISOString(), updates: [], phases: fasen, doneSteps: [], phase: 0 } })
    return { ...deal, projectId: id }
  }

  /** Nieuwe opdracht (offerte): bij een bestaand bedrijf of klantdossier komt hij bij dat contact. Eén klant kan zoveel opdrachten hebben als je wilt. */
  const maak = (titel: string, bedrijf: string, stage: Stage, clientId?: string) => {
    if (!bedrijf.trim() && !clientId) return
    let deal: Deal = { id: uid(), titel: titel.trim(), stage, value: 0, owner: s.me, createdAt: new Date().toISOString() }
    const client = clientId ? s.clients.find((x) => x.id === clientId) : undefined
    const bestaand = (client && s.contacts.find((c) => c.id === client.contactId)) ?? s.contacts.find((c) => c.company.trim().toLowerCase() === bedrijf.trim().toLowerCase())
    setNieuw(null)
    if (bestaand) {
      deal = projectBijAkkoord(bestaand.id, deal)
      d({ type: 'contact:patch', id: bestaand.id, patch: { deals: [...(bestaand.deals ?? []), deal] } })
      if (client) bezigMet(client.id)
      return
    }
    const c: Contact = { id: uid(), name: '', company: (client?.name ?? bedrijf).trim(), role: '', email: '', phone: '', stage: client ? 'klant' : stage, value: 0, owner: s.me, source: '', timeline: [], deals: titel.trim() ? [deal] : [] }
    d({ type: 'contact:upsert', contact: c })
    if (client) { d({ type: 'client:upsert', client: { ...client, contactId: c.id } }); bezigMet(client.id) }
    else setOpenId(c.id)
  }
  /** Verslepen: een deal verhuist zelf; wordt hij klant, dan wordt het bedrijf ook klant. */
  const verplaats = (key: string, stage: Stage) => {
    const [soort, cid, did] = key.split(':')
    const c = s.contacts.find((x) => x.id === cid)
    if (!c) return
    if (soort === 'c') return d({ type: 'contact:stage', id: c.id, stage })
    d({ type: 'contact:patch', id: c.id, patch: { deals: (c.deals ?? []).map((x) => (x.id === did ? projectBijAkkoord(c.id, { ...x, stage }) : x)), ...(isKlant(stage) && !isKlant(c.stage) ? { stage } : {}) } })
    const client = s.clients.find((x) => x.contactId === c.id)
    if (client) bezigMet(client.id)
  }
  /** Klant met profiel: naar het profiel. Anders: het contactvenster. */
  // Elke opdracht-kaart opent de verkoopkaart (ook bij bestaande klanten); het klantdossier staat daarin als knop
  const openKaart = (c: Contact) => setOpenId(c.id)

  /** Opdracht naar een klantdossier slepen: akkoord op de offerte, en de opdracht hoort bij die klant. Los op het blok = nieuwe klant. */
  const naarDossier = (key: string, client?: Client) => {
    const [soort, cid, did] = key.split(':')
    const c = s.contacts.find((x) => x.id === cid)
    if (!c) return
    const deal = soort === 'd' ? (c.deals ?? []).find((x) => x.id === did) : undefined
    const doel = client ? s.contacts.find((x) => x.id === client.contactId) : c
    if (!doel) return
    if (deal && doel.id !== c.id) {
      d({ type: 'contact:patch', id: c.id, patch: { deals: (c.deals ?? []).filter((x) => x.id !== did) } })
      d({ type: 'contact:patch', id: doel.id, patch: { stage: 'klant', deals: [...(doel.deals ?? []), projectBijAkkoord(doel.id, { ...deal, stage: 'klant' })] } })
    } else {
      d({ type: 'contact:patch', id: c.id, patch: { stage: 'klant', ...(deal ? { deals: (c.deals ?? []).map((x) => (x.id === did ? projectBijAkkoord(c.id, { ...x, stage: 'klant' as Stage }) : x)) } : {}) } })
    }
    const bestaand = client ?? s.clients.find((x) => x.contactId === doel.id)
    if (bestaand) return go(`klanten/${bestaand.id}`)
    const id = s.clients.some((x) => x.id === slug(doel.company)) || !slug(doel.company) ? uid() : slug(doel.company)
    d({ type: 'client:upsert', client: { id, name: doel.company, subdomain: id, contactId: doel.id, pakket: 'Nog invullen', start: new Date().toISOString().slice(0, 10), phase: 0, doneSteps: [], frameUrl: '' } })
    go(`klanten/${id}`)
  }

  return (
    <>
      <PageHead title="CRM" sub="Elke kaart is een opdracht, met de klant erbij. Sleep naar de volgende fase, of naar een klantdossier onderaan.">
        <Segmented value={weergave} onChange={(v) => go(v === 'pipeline' ? 'crm' : `crm/${v}`)} options={[{ value: 'pipeline', label: 'Pipeline' }, { value: 'contacten', label: 'Alle contacten' }, ...(kan('geld') ? [{ value: 'offertes' as const, label: 'Offertes' }] : [])]} />
        {kan('crm_bewerken') && <button className="btn primary" onClick={() => { if (weergave !== 'pipeline') go('crm'); setNieuwIn('lead') }}><Icon name="plus" size={16} /> Opdracht</button>}
      </PageHead>

      {weergave === 'offertes' ? (
        <OffertesLijst onOpen={(contactNaam) => { const c = s.contacts.find((x) => x.company.trim().toLowerCase() === contactNaam.trim().toLowerCase()); if (c) openKaart(c) }} />
      ) : weergave === 'contacten' ? (
        <AlleContacten onOpen={openKaart} />
      ) : (
        <div className="board pipeline">
          {(() => {
            const items = pipelineItems(s.contacts)
            return STAGES.map((st) => {
            const col = items.filter((it) => it.stage === st.key)
            const total = col.reduce((a, it) => a + it.value, 0)
            return (
              <div key={st.key} className={`board-col ${drag ? 'droppable' : ''}`} style={{ background: st.kolom }} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag?.startsWith('k:')) setNieuw({ stage: st.key as Stage, clientId: drag.slice(2) }); else if (drag) verplaats(drag, st.key as Stage); setDrag(null) }}>
                <div className="board-col-head">
                  <span className="fase-pil" style={{ color: st.kleur, background: st.bg }}><i style={{ background: st.kleur }} />{st.label}</span>
                  <span className="count">{col.length}</span>
                </div>
                {kan('geld') && <div className="muted small col-total">{euro(total)} aan opdrachten</div>}
                {col.length === 0 && st.key === 'klant' && <p className="muted small" style={{ margin: '4px 4px 8px' }}>Opdrachten waar de klant akkoord op gaf.</p>}
                {col.length === 0 && st.key === 'koud' && <p className="muted small" style={{ margin: '4px 4px 8px' }}>Nog geen koude prospects.</p>}
                {col.map((it) => <DealKaart key={it.key} it={it} onDrag={setDrag} onOpen={() => openKaart(it.contact)} />)}
                {kan('crm_bewerken') && (nieuwIn === st.key ? (
                  <NieuweDeal key={nieuw?.clientId ?? 'leeg'} klant={s.clients.find((x) => x.id === nieuw?.clientId)?.name} onKlaar={(titel, bedrijf) => maak(titel, bedrijf, st.key as Stage, nieuw?.clientId)} onStop={() => setNieuwIn(null)} />
                ) : <button className="kolom-nieuw" onClick={() => setNieuwIn(st.key as Stage)}><Icon name="plus" size={13} /> Nieuw</button>)}
              </div>
            )
            })
          })()}
        </div>
      )}

      {weergave === 'pipeline' && <KlantDossiers drag={drag} setDrag={setDrag} onDrop={naarDossier} go={go} />}

      {open && <ContactDrawer contact={open} onClose={() => setOpenId(null)} go={go} />}
    </>
  )
}

const OFFERTE_STATUS: Record<string, { label: string; kleur: string; bg: string }> = {
  draft: { label: 'Concept', kleur: '#6F6E69', bg: '#EDEDEB' },
  open: { label: 'Verstuurd', kleur: '#2B6E99', bg: '#DCEBF5' },
  late: { label: 'Verlopen', kleur: '#B85F0B', bg: '#FAE3CC' },
  accepted: { label: 'Akkoord', kleur: '#3B7354', bg: '#DCEBDF' },
  billed: { label: 'Gefactureerd', kleur: '#3B7354', bg: '#DCEBDF' },
  rejected: { label: 'Afgewezen', kleur: '#B33E39', bg: '#F8DCDA' },
  archived: { label: 'Gearchiveerd', kleur: '#6F6E69', bg: '#EDEDEB' },
}

/** Alle offertes uit Moneybird, met filter op status. */
function OffertesLijst({ onOpen }: { onOpen: (klant: string) => void }) {
  const [data, setData] = useState<Offerte[] | { fout: string } | null>(null)
  const [filter, setFilter] = useState<'alles' | 'lopend' | 'akkoord' | 'afgewezen'>('lopend')
  const [zoek, setZoek] = useState('')
  useEffect(() => { alleOffertes().then((r) => setData('fout' in r ? r : r.offertes ?? [])) }, [])
  if (!data) return <div className="card"><p className="muted">Offertes ophalen uit Moneybird…</p></div>
  if ('fout' in data) return <div className="card"><p className="muted">Moneybird gaf een fout: {data.fout}</p></div>
  const past = (o: Offerte) => filter === 'alles' || (filter === 'lopend' ? ['draft', 'open', 'late'].includes(o.status) : filter === 'akkoord' ? ['accepted', 'billed'].includes(o.status) : o.status === 'rejected')
  const lijst = data.filter(past).filter((o) => !zoek || `${o.klant} ${o.omschrijving} ${o.nummer}`.toLowerCase().includes(zoek.toLowerCase()))
  const totaal = lijst.reduce((a, o) => a + o.bedrag, 0)
  return (
    <>
      <div className="card filter-balk">
        {(['lopend', 'akkoord', 'afgewezen', 'alles'] as const).map((f) => <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f === 'lopend' ? 'Lopend' : f === 'akkoord' ? 'Akkoord' : f === 'afgewezen' ? 'Afgewezen' : 'Alles'}</button>)}
        <input className="inline-input" placeholder="Zoek op klant of omschrijving" value={zoek} onChange={(e) => setZoek(e.target.value)} style={{ maxWidth: 260 }} />
        <span className="filter-rechts muted small">{lijst.length} offertes · {euro(totaal)} excl. btw</span>
      </div>
      <div className="card flush">
        <table className="table">
          <thead><tr><th>Klant</th><th>Omschrijving</th><th>Nummer</th><th>Datum</th><th>Status</th><th style={{ textAlign: 'right' }}>Bedrag</th><th /></tr></thead>
          <tbody>
            {lijst.map((o) => {
              const st = OFFERTE_STATUS[o.status] ?? { label: o.status, kleur: '#6F6E69', bg: '#EDEDEB' }
              return (
                <tr key={o.id}>
                  <td><button className="link" onClick={() => onOpen(o.klant)}>{o.klant || '—'}</button></td>
                  <td>{o.omschrijving || '—'}</td>
                  <td className="muted">{o.nummer ?? 'concept'}</td>
                  <td className="muted">{o.datum ? fmtDate(o.datum) : '—'}</td>
                  <td><span className="fase-pil" style={{ color: st.kleur, background: st.bg }}><i style={{ background: st.kleur }} />{st.label}</span></td>
                  <td style={{ textAlign: 'right' }}>{euro(o.bedrag)}</td>
                  <td><a className="icon-btn" href={o.url} target="_blank" rel="noreferrer" aria-label="Openen in Moneybird"><Icon name="external" size={14} /></a></td>
                </tr>
              )
            })}
            {lijst.length === 0 && <tr><td colSpan={7} className="muted">Geen offertes in deze selectie.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Alle klantdossiers als blokken onder de pipeline. Sleep een opdracht op een klant (of op het blok voor een nieuwe klant). */
function KlantDossiers({ drag, setDrag, onDrop, go }: { drag: string | null; setDrag: (k: string | null) => void; onDrop: (key: string, client?: Client) => void; go: (r: string) => void }) {
  const { s } = useStore()
  const kan = useMag()
  const [boven, setBoven] = useState<string | null>(null)
  if (!kan('klanten')) return null
  // Recent bovenaan: dossier geopend, contact, opdracht, project, update of taak
  const bezig = laatstBezig()
  const recent = (c: Client) => {
    const contact = s.contacts.find((x) => x.id === c.contactId)
    const projecten = s.projects.filter((p) => p.clientId === c.id)
    const pids = new Set(projecten.map((p) => p.id))
    const data = [
      bezig[c.id], c.start, contact?.timeline[0]?.at, ...(contact?.deals ?? []).map((x) => x.createdAt),
      ...projecten.flatMap((p) => [p.createdAt, p.updates[0]?.at]),
      ...s.tasks.filter((t) => t.clientId === c.id || (t.projectId && pids.has(t.projectId))).flatMap((t) => [t.updatedAt, t.startedAt, t.comments[t.comments.length - 1]?.at]),
    ]
    const r = (data.filter(Boolean) as string[]).sort()
    return r[r.length - 1] ?? ''
  }
  const klanten = [...s.clients].map((c) => ({ c, r: recent(c) })).sort((a, b) => b.r.localeCompare(a.r)).map((x) => x.c)
  // Lopend: een offerte of opdracht in de pipeline, of een productie die nog niet is opgeleverd
  const isLopend = (c: Client) => {
    const contact = s.contacts.find((x) => x.id === c.contactId)
    return (contact?.deals ?? []).some((x) => x.stage !== 'afgehandeld') || s.projects.some((p) => p.soort === 'productie' && p.clientId === c.id && p.fase !== 'live')
  }
  const lopend = klanten.filter(isLopend)
  const rest = klanten.filter((c) => !isLopend(c))
  const hint = drag?.startsWith('k:') ? 'Laat los in een fase hierboven voor een nieuwe offerte' : drag ? 'Laat los op een klant, of hier voor een nieuwe klant' : 'Recent bovenaan · sleep een klant omhoog voor een nieuwe offerte'
  const vakjes = (lijst: Client[]) => (
    <div className="klant-vakjes">
      {lijst.map((c) => {
        const merk = s.contacts.find((x) => x.id === c.contactId)
        const n = s.projects.filter((p) => p.soort === 'productie' && p.clientId === c.id && p.fase !== 'live').length
        const offertes = (merk?.deals ?? []).filter((x) => x.stage !== 'afgehandeld' && x.stage !== 'klant').length
        return (
          <button key={c.id} className={`klant-vakje ${boven === c.id ? 'boven' : ''}`} onClick={() => go(`klanten/${c.id}`)}
            draggable={kan('crm_bewerken')} onDragStart={() => setDrag(`k:${c.id}`)} onDragEnd={() => setTimeout(() => setDrag(null), 0)}
            onDragOver={(e) => { if (drag?.startsWith('k:')) return; e.preventDefault(); e.stopPropagation(); setBoven(c.id) }}
            onDragLeave={() => setBoven(null)}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setBoven(null); if (drag && !drag.startsWith('k:')) onDrop(drag, c) }}>
            <MerkLogo merk={merk} naam={c.name} size={36} />
            <span className="klant-vakje-tekst">
              <strong>{c.name}</strong>
              <span className="muted small">{[n ? `${n} ${n === 1 ? 'project' : 'projecten'}` : '', offertes ? `${offertes} ${offertes === 1 ? 'offerte' : 'offertes'}` : '', !n && !offertes ? faseVan(c).label : ''].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
  const blok = (id: string, titel: string, lijst: Client[], uitleg: string, leeg: string) => (
    <section className={`card crm-dossiers ${drag ? 'droppable' : ''} ${boven === id ? 'boven' : ''}`}
      onDragOver={(e) => { if (drag?.startsWith('k:')) return; e.preventDefault(); if (boven !== id && !(e.target as HTMLElement).closest('.klant-vakje')) setBoven(id) }}
      onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setBoven(null) }}
      onDrop={(e) => { e.preventDefault(); setBoven(null); if (drag && !drag.startsWith('k:') && !(e.target as HTMLElement).closest('.klant-vakje')) onDrop(drag) }}>
      <div className="section-row" style={{ marginTop: 0 }}>
        <h3 className="section-title">{titel} <span className="muted small">({lijst.length})</span></h3>
        <span className="muted small">{uitleg}</span>
      </div>
      {lijst.length ? vakjes(lijst) : <p className="muted small" style={{ margin: 0 }}>{leeg}</p>}
    </section>
  )
  return (
    <>
      {blok('lopend', 'Klanten met een lopende opdracht', lopend, hint, 'Geen klanten met een lopende opdracht of offerte.')}
      {blok('rest', 'Overige klanten', rest, 'Niets lopend en geen open offerte · sleep een klant omhoog voor een nieuwe offerte', 'Alle klanten hebben iets lopen.')}
    </>
  )
}

function NieuweDeal({ klant, onKlaar, onStop }: { klant?: string; onKlaar: (titel: string, bedrijf: string) => void; onStop: () => void }) {
  const { s } = useStore()
  const [titel, setTitel] = useState('')
  const [bedrijf, setBedrijf] = useState(klant ?? '')
  const klaar = () => bedrijf.trim() && onKlaar(titel, bedrijf)
  return (
    <div className="board-card nieuw-kaart">
      <input autoFocus placeholder="Project of video, bijv. Bedrijfsfilm 2027" value={titel} list="deal-diensten" onChange={(e) => setTitel(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && klant) klaar(); if (e.key === 'Escape') onStop() }} />
      <datalist id="deal-diensten">{TRAJECTEN.map((t) => <option key={t.naam} value={t.naam} />)}</datalist>
      <input placeholder="Klant of bedrijf" value={bedrijf} list="deal-bedrijven" onChange={(e) => setBedrijf(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') klaar(); if (e.key === 'Escape') onStop() }} />
      <datalist id="deal-bedrijven">{s.contacts.map((c) => <option key={c.id} value={c.company} />)}</datalist>
      <div className="nieuw-kaart-knoppen">
        <button className="btn small primary" onClick={klaar} disabled={!bedrijf.trim()}>Maken</button>
        <button className="btn small ghost" onClick={onStop}>Annuleren</button>
      </div>
    </div>
  )
}

function DealKaart({ it, onDrag, onOpen }: { it: PipelineItem; onDrag: (key: string | null) => void; onOpen: () => void }) {
  const { s } = useStore()
  const kan = useMag()
  const c = it.contact
  const taken = takenVanContact(s, c)
  const klaar = taken.filter((t) => t.status === 'klaar').length
  const last = c.timeline[0]
  const bestaandeKlant = it.deal && isKlant(c.stage) && !isKlant(it.stage)
  return (
    <div className="board-card" draggable={kan('crm_bewerken')} onDragStart={() => onDrag(it.key)} onDragEnd={() => onDrag(null)} onClick={onOpen}>
      {it.deal ? (
        <>
          <div className="board-card-title deal-titel">{it.titel}</div>
          <div className="kaart-kop deal-bedrijf"><MerkLogo merk={c} naam={c.company} size={18} /><span className="small">{c.company}</span>{bestaandeKlant && <span className="badge status-klaar">klant</span>}</div>
        </>
      ) : (
        <>
          <div className="board-card-title kaart-kop"><MerkLogo merk={c} naam={c.company} size={24} /><span>{c.company}</span></div>
          <div className="muted small">{[c.name, c.source].filter(Boolean).join(' · ')}{(c.personen?.length ?? 0) > 0 ? ` +${c.personen!.length}` : ''}</div>
        </>
      )}
      {c.opvolgen && <div className="small opvolgen-label"><Icon name="calendar" size={12} /> Opvolgen {opvolgDatum(c.opvolgen)}</div>}
      {!it.deal && taken.length > 0 && (
        <div className="row-progress">
          <span className="muted small">☑ {klaar}/{taken.length} taken</span>
          <span className="mini-bar"><i style={{ width: `${(klaar / taken.length) * 100}%` }} /></span>
        </div>
      )}
      <div className="board-card-foot">
        {kan('geld') ? <span className="small strong" title="Dealwaarde">{euro(it.value)}</span> : <span />}
        <span className="muted small">{last ? fmtDateTime(last.at).split(',')[0] : 'Geen contact'}</span>
        <Avatar id={it.deal?.owner ?? c.owner} size={22} />
      </div>
    </div>
  )
}

/** Deals van dit bedrijf: wat we verkopen, elk met eigen fase en bedrag. */
export function Deals({ contact }: { contact: Contact }) {
  const { s, d } = useStore()
  const kan = useMag()
  const deals = contact.deals ?? []
  const zet = (nieuw: Deal[]) => d({ type: 'contact:patch', id: contact.id, patch: { deals: nieuw } })
  const wijzig = (id: string, p: Partial<Deal>) => {
    const nieuw = deals.map((x) => (x.id === id ? { ...x, ...p } : x))
    d({ type: 'contact:patch', id: contact.id, patch: { deals: nieuw, ...(p.stage && isKlant(p.stage) && !isKlant(contact.stage) ? { stage: p.stage } : {}) } })
  }
  return (
    <div className="deals">
      {deals.length === 0 && <p className="muted small" style={{ margin: '0 0 8px' }}>Nog geen deals. Voeg toe wat je verkoopt, bijv. een bedrijfsfilm of een campagne.</p>}
      {deals.map((x) => (
        <fieldset key={x.id} className="kaal deal-rij" disabled={!kan('crm_bewerken')}>
          <input className="inline-input deal-naam" placeholder="Project of video" value={x.titel} onChange={(e) => wijzig(x.id, { titel: e.target.value })} />
          <select value={x.stage} style={{ color: ALLE_STAGES.find((st) => st.key === x.stage)?.kleur }} onChange={(e) => wijzig(x.id, { stage: e.target.value as Stage })}>
            {ALLE_STAGES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
          </select>
          {kan('geld') && <input className="inline-input deal-bedrag" type="number" min={0} step={50} placeholder="€ 0" value={x.value || ''} onChange={(e) => wijzig(x.id, { value: Math.max(0, Number(e.target.value) || 0) })} />}
          <button className="icon-btn" aria-label="Deal verwijderen" onClick={() => { const oud = deals; zet(deals.filter((y) => y.id !== x.id)); metOngedaan('Deal verwijderd', () => zet(oud)) }}><Icon name="x" size={13} /></button>
        </fieldset>
      ))}
      {kan('crm_bewerken') && <button className="btn small" onClick={() => zet([...deals, { id: uid(), titel: '', stage: isKlant(contact.stage) ? 'voorstel' : contact.stage === 'afgehandeld' ? 'lead' : contact.stage, value: 0, owner: s.me, createdAt: new Date().toISOString() }])}><Icon name="plus" size={14} /> Deal of offerte</button>}
    </div>
  )
}

/** Alle contacten als lijst, ook afgehandelde. Zoeken op bedrijf, naam, mail of telefoon. */
function AlleContacten({ onOpen }: { onOpen: (c: Contact) => void }) {
  const { s } = useStore()
  const kan = useMag()
  const [zoek, setZoek] = useState('')
  const [fase, setFase] = useState<string>('all')
  const q = zoek.trim().toLowerCase()
  const lijst = s.contacts
    .filter((c) => fase === 'all' || c.stage === fase)
    .filter((c) => !q || [c.company, c.name, c.email, c.phone, ...(c.personen ?? []).flatMap((p) => [p.naam, p.email ?? '', p.telefoon ?? ''])].some((x) => x.toLowerCase().includes(q)))
    .sort((a, b) => a.company.localeCompare(b.company, 'nl'))
  return (
    <>
      <div className="card filter-balk">
        <input className="zoek" placeholder="Zoek op bedrijf, naam, mail of telefoon" value={zoek} onChange={(e) => setZoek(e.target.value)} />
        <span className="filter-rechts">
          <select value={fase} onChange={(e) => setFase(e.target.value)}>
            <option value="all">Alle fasen ({s.contacts.length})</option>
            {ALLE_STAGES.map((st) => <option key={st.key} value={st.key}>{st.label} ({s.contacts.filter((c) => c.stage === st.key).length})</option>)}
          </select>
        </span>
      </div>
      <div className="card flush">
        <table className="table">
          <thead><tr><th>Bedrijf</th><th>Contactpersoon</th><th>E-mail</th><th>Telefoon</th><th>Fase</th>{kan('geld') && <th>Dealwaarde</th>}<th>Laatste contact</th><th>Eigenaar</th></tr></thead>
          <tbody>
            {lijst.map((c) => {
              const st = ALLE_STAGES.find((x) => x.key === c.stage)
              return (
                <tr key={c.id} className="task-row" onClick={() => onOpen(c)}>
                  <td className="task-title"><span className="kaart-kop"><MerkLogo merk={c} naam={c.company} size={20} /><span>{c.company}</span></span></td>
                  <td>{c.name || <span className="muted">—</span>}{(c.personen?.length ?? 0) > 0 && <span className="muted small"> +{c.personen!.length}</span>}</td>
                  <td className="small">{c.email ? <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>{c.email}</a> : <span className="muted">—</span>}</td>
                  <td className="small">{c.phone ? <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()}>{c.phone}</a> : <span className="muted">—</span>}</td>
                  <td>{st && <span className="fase-pil" style={{ color: st.kleur, background: st.bg }}><i style={{ background: st.kleur }} />{st.label}</span>}</td>
                  {kan('geld') && <td className="small">{c.value ? euro(c.value) : '—'}</td>}
                  <td className="muted small">{c.timeline[0] ? fmtDate(c.timeline[0].at) : '—'}</td>
                  <td><Avatar id={c.owner} size={22} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {lijst.length === 0 && <p className="muted small" style={{ padding: 16 }}>Geen contacten gevonden.</p>}
      </div>
    </>
  )
}

/** Extra contactpersonen bij een bedrijf. */
export function Contactpersonen({ contact }: { contact: Contact }) {
  const { d } = useStore()
  const kan = useMag()
  const [nieuw, setNieuw] = useState<Contactpersoon | null>(null)
  const lijst = contact.personen ?? []
  const zet = (personen: Contactpersoon[]) => d({ type: 'contact:patch', id: contact.id, patch: { personen } })
  const wijzig = (id: string, p: Partial<Contactpersoon>) => zet(lijst.map((x) => (x.id === id ? { ...x, ...p } : x)))
  return (
    <div className="personen">
      {contact.name && (
        <div className="persoon hoofd">
          {kan('crm_bewerken') && <button className="icon-btn persoon-weg" aria-label={`${contact.name} verwijderen`} onClick={() => {
            const oud = { name: contact.name, role: contact.role, email: contact.email, phone: contact.phone, personen: contact.personen }
            const [volgende, ...rest] = lijst
            d({ type: 'contact:patch', id: contact.id, patch: volgende ? { name: volgende.naam, role: volgende.rol ?? '', email: volgende.email ?? '', phone: volgende.telefoon ?? '', personen: rest } : { name: '', role: '', email: '', phone: '' } })
            metOngedaan(`${contact.name} verwijderd`, () => d({ type: 'contact:patch', id: contact.id, patch: oud }))
          }}><Icon name="trash" size={13} /></button>}
          <strong>{contact.name}</strong>{contact.role && <span className="muted small"> · {contact.role}</span>}
          <div className="small">{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}{contact.email && contact.phone && ' · '}{contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}</div>
        </div>
      )}
      {lijst.map((p) => (
        <fieldset key={p.id} className="kaal persoon" disabled={!kan('crm_bewerken')}>
          <div className="persoon-rij">
            <input className="inline-input" placeholder="Naam" value={p.naam} onChange={(e) => wijzig(p.id, { naam: e.target.value })} />
            <input className="inline-input" placeholder="Rol" value={p.rol ?? ''} onChange={(e) => wijzig(p.id, { rol: e.target.value || undefined })} />
            <button className="icon-btn" aria-label={`${p.naam} verwijderen`} onClick={() => { zet(lijst.filter((x) => x.id !== p.id)); metOngedaan(`${p.naam || 'Contactpersoon'} verwijderd`, () => zet(lijst)) }}><Icon name="trash" size={13} /></button>
          </div>
          <div className="persoon-rij">
            <input className="inline-input" type="email" placeholder="naam@bedrijf.nl" value={p.email ?? ''} onChange={(e) => wijzig(p.id, { email: e.target.value.trim() || undefined })} />
            <input className="inline-input" type="tel" placeholder="06…" value={p.telefoon ?? ''} onChange={(e) => wijzig(p.id, { telefoon: e.target.value || undefined })} />
          </div>
        </fieldset>
      ))}
      {kan('crm_bewerken') && (nieuw ? (
        <div className="persoon">
          <div className="persoon-rij">
            <input className="inline-input" autoFocus placeholder="Naam" value={nieuw.naam} onChange={(e) => setNieuw({ ...nieuw, naam: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && nieuw.naam.trim() && (zet([...lijst, nieuw]), setNieuw(null))} />
            <button className="btn small primary" disabled={!nieuw.naam.trim()} onClick={() => { zet([...lijst, { ...nieuw, naam: nieuw.naam.trim() }]); setNieuw(null) }}>Toevoegen</button>
            <button className="btn small ghost" onClick={() => setNieuw(null)}>Annuleren</button>
          </div>
        </div>
      ) : <button className="btn small" onClick={() => setNieuw({ id: uid(), naam: '' })}><Icon name="plus" size={14} /> Contactpersoon</button>)}
    </div>
  )
}

/** Snel een taak bij dit contact: titel, voorstellen als "Opvolgen", en een datum. Komt in Taken en Planning. */
export function SnelContactTaak({ contactId, clientId }: { contactId?: string; clientId?: string }) {
  const { s, d } = useStore()
  const [titel, setTitel] = useState('')
  const [datum, setDatum] = useState(standaardAfVoor())
  const maak = (t = titel) => {
    if (!t.trim()) return
    d({ type: 'task:upsert', task: newTask({ title: t.trim(), contactId, clientId, soort: clientId ? 'Klantwerk' : 'Sales', deadline: datum }, s.me) })
    setTitel('')
  }
  return (
    <div className="snel-contact-taak">
      <div className="kind-row">
        {['Opvolgen', 'Bellen', 'Voorstel maken'].map((x) => <button key={x} className="chip" onClick={() => setTitel(x)}>{x}</button>)}
      </div>
      <div className="inline-form">
        <input placeholder="Nieuwe taak, bijv. Opvolgen" value={titel} onChange={(e) => setTitel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && maak()} />
        <label className="small muted" title="Af vóór (de echte deadline is de dag ervoor om 18:00)">af vóór <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
        <button className="btn small primary" onClick={() => maak()} disabled={!titel.trim()}>Taak</button>
      </div>
    </div>
  )
}

function ContactDrawer({ contact, onClose, go }: { contact: Contact; onClose: () => void; go: (r: string) => void }) {
  const { s, d } = useStore()
  const kan = useMag()
  const [task, setTask] = useState<Task | null>(null)
  const client = s.clients.find((c) => c.contactId === contact.id)
  const tasks = takenVanContact(s, contact)

  const patch = (p: Partial<Contact>) => d({ type: 'contact:patch', id: contact.id, patch: p })

  const makeClient = () => {
    const id = s.clients.some((c) => c.id === slug(contact.company)) || !slug(contact.company) ? uid() : slug(contact.company)
    d({ type: 'client:upsert', client: { id, name: contact.company, subdomain: id, contactId: contact.id, pakket: 'Nog invullen', start: new Date().toISOString().slice(0, 10), phase: 0, doneSteps: [], frameUrl: '' } })
    go(`klanten/${id}`)
  }

  const verwijder = () => {
    if (client) return window.alert(`${contact.company} heeft een klantprofiel. Verwijder eerst het klantprofiel (onderaan het profiel), daarna kan het contact weg.`)
    if (!window.confirm(`${contact.company} verwijderen uit het CRM? Notities en contactgeschiedenis gaan mee. Taken blijven bestaan.`)) return
    d({ type: 'weg', table: 'contacts', id: contact.id })
    onClose()
  }

  return (
    <Drawer open onClose={onClose} wide title={<><div className="drawer-kicker">{[contact.name, contact.role].filter(Boolean).join(' · ') || 'Contact'}</div>{contact.company}</>}>
      <div className="contact-grid">
        <fieldset className="kaal" disabled={!kan('crm_bewerken')}>
          {!kan('crm_bewerken') && <p className="muted small" style={{ marginTop: 0 }}>Je kunt dit contact bekijken, niet aanpassen.</p>}
          <div className="info-list">
            <div><span className="muted">Fase</span>
              <select value={contact.stage} style={{ color: ALLE_STAGES.find((x) => x.key === contact.stage)?.kleur }} onChange={(e) => d({ type: 'contact:stage', id: contact.id, stage: e.target.value as Stage })}>
                {ALLE_STAGES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
              </select>
            </div>
            <div><span className="muted">Bedrijf</span><input className="inline-input" value={contact.company} onChange={(e) => patch({ company: e.target.value })} /></div>
            <div><span className="muted">Naam</span><input className="inline-input" placeholder="Contactpersoon" value={contact.name} onChange={(e) => patch({ name: e.target.value })} /></div>
            <div><span className="muted">Functie</span><input className="inline-input" placeholder="Bijv. eigenaar" value={contact.role} onChange={(e) => patch({ role: e.target.value })} /></div>
            {kan('geld') && !(contact.deals?.length) && <div><span className="muted">Dealwaarde (ex btw)</span><input className="inline-input" type="number" min={0} step={50} value={contact.value || ''} placeholder="€ 0" onChange={(e) => patch({ value: Math.max(0, Number(e.target.value) || 0) })} /></div>}
            <div><span className="muted">Eigenaar</span>
              <span className="eigenaar-veld"><Avatar id={contact.owner} size={20} />
                <select value={contact.owner} onChange={(e) => patch({ owner: e.target.value as PersonId })}>
                  {TEAM.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </span>
            </div>
            <div><span className="muted">Bron</span><input className="inline-input" placeholder="Bijv. LinkedIn, netwerk" value={contact.source} onChange={(e) => patch({ source: e.target.value })} /></div>
            <div><span className="muted">E-mail</span><input className="inline-input" type="email" placeholder="naam@bedrijf.nl" value={contact.email} onChange={(e) => patch({ email: e.target.value.trim() })} /></div>
            <div><span className="muted">Telefoon</span><input className="inline-input" type="tel" placeholder="06…" value={contact.phone} onChange={(e) => patch({ phone: e.target.value })} /></div>
            <div><span className="muted">Opvolgen op</span>
              <input className="inline-input" type="date" value={contact.opvolgen ?? ''} onChange={(e) => d({ type: 'contact:patch', id: contact.id, patch: { opvolgen: e.target.value || undefined } })} />
            </div>
            {contact.opvolgen && <p className="muted small" style={{ margin: '-4px 0 0' }}>Op {opvolgDatum(contact.opvolgen)} krijgt {personName(contact.owner)} 's ochtends een melding in Slack. Er komt geen taak of agenda-afspraak.</p>}
            <MerkVelden contact={contact} onChange={(p) => d({ type: 'contact:patch', id: contact.id, patch: p })} />
          </div>

          {isKlant(contact.stage) && (
            client ? (
              <button className="btn wide" onClick={() => go(`klanten/${client.id}`)}>
                <Icon name="clients" size={16} /> Klantprofiel · {faseVan(client).label}
              </button>
            ) : (
              <div className="callout">
                <strong>Nieuwe klant!</strong> Maak het klantprofiel aan, dan start de onboarding en krijgt de klant een portaal.
                <button className="btn primary wide" onClick={makeClient}>Klantprofiel aanmaken</button>
              </div>
            )
          )}

          <h3 className="section-title">Deals en offertes</h3>
          <Deals contact={contact} />

          <h3 className="section-title">Contactpersonen</h3>
          <Contactpersonen contact={contact} />

          <div className="section-row">
            <h3 className="section-title">Taken {tasks.length > 0 && <span className="muted small">{tasks.filter((t) => t.status === 'klaar').length}/{tasks.length} af</span>}</h3>
            <button className="btn small ghost" onClick={() => setTask(newTask({ contactId: contact.id, clientId: client?.id }, s.me))}>Uitgebreid…</button>
          </div>
          <SnelContactTaak contactId={contact.id} clientId={client?.id} />
          <div className="card flush mini-table"><TaskTable tasks={tasks} onOpen={setTask} showClient={false} /></div>

          {kan('verwijderen') && <button className="link small danger" style={{ marginTop: 16 }} onClick={verwijder}>Contact verwijderen…</button>}
        </fieldset>

        <div>
          <ContactGeschiedenis contact={contact} />
        </div>
      </div>
      {task && <TaskDrawer key={task.id} task={task} onClose={() => setTask(null)} />}
    </Drawer>
  )
}

/** Contactgeschiedenis van een contact: notities, WhatsApp en gesprekken vastleggen (alleen het team). */
export function ContactGeschiedenis({ contact }: { contact: Contact }) {
  const { s, d } = useStore()
  const [kind, setKind] = useState<TimelineKind>('notitie')
  const [body, setBody] = useState('')
  const [image, setImage] = useState<string | undefined>()
  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (f?: File) => {
    if (!f) return
    const r = new FileReader()
    r.onload = () => { setImage(String(r.result)); if (kind === 'notitie') setKind('whatsapp') }
    r.readAsDataURL(f)
  }

  const add = () => {
    if (!body.trim() && !image) return
    d({ type: 'contact:timeline', id: contact.id, item: { id: uid(), kind, at: new Date().toISOString(), author: s.me, body: body.trim(), image } })
    setBody(''); setImage(undefined)
  }

  return (
    <>
          <h3 className="section-title">Contactgeschiedenis</h3>
      <div className="add-timeline">
        <div className="kind-row">
          {(['notitie', 'whatsapp', 'gesprek'] as TimelineKind[]).map((k) => (
            <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}><Icon name={KIND[k].icon} size={13} /> {KIND[k].label}</button>
          ))}
        </div>
        <textarea rows={2} placeholder="Wat is er besproken?" value={body} onChange={(e) => setBody(e.target.value)} />
        {image && <img className="preview-img" src={image} alt="Voorbeeld screenshot" />}
        <div className="mention-bar">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn small ghost" onClick={() => fileRef.current?.click()}><Icon name="image" size={14} /> Screenshot toevoegen</button>
          <button className="btn small" onClick={add} disabled={!body.trim() && !image}>Toevoegen</button>
        </div>
      </div>

      <DemoNote>Mails komen straks automatisch binnen vanuit de Rise-mailboxen (zie plan).</DemoNote>

      <ol className="timeline">
        {contact.timeline.length === 0 && <li className="muted small">Nog geen contact vastgelegd.</li>}
        {contact.timeline.map((t) => (
          <li key={t.id} className={`tl tl-${t.kind}`}>
            <span className="tl-icon"><Icon name={KIND[t.kind].icon} size={14} /></span>
            <div className="tl-body">
              <div className="tl-meta">
                <strong>{KIND[t.kind].label}</strong>
                {t.author && <span className="muted"> · {personName(t.author)}</span>}
                <span className="muted"> · {fmtDateTime(t.at)}</span>
                <button className="icon-btn tl-weg" aria-label="Verwijderen" onClick={() => {
                  const oud = contact.timeline
                  d({ type: 'contact:patch', id: contact.id, patch: { timeline: oud.filter((x) => x.id !== t.id) } })
                  metOngedaan(`${KIND[t.kind].label} verwijderd`, () => d({ type: 'contact:patch', id: contact.id, patch: { timeline: oud } }))
                }}><Icon name="x" size={13} /></button>
              </div>
              {t.subject && <div className="tl-subject">{t.subject}</div>}
              {t.body && <div>{t.body}</div>}
              {t.image && <img className="tl-img" src={t.image} alt="Screenshot" />}
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

/** Van een offerte een lopend project maken: alleen naam, bedrag en traject gaan mee, nooit de notities. Geeft de project-id. */
export function offerteNaarProject(st: ReturnType<typeof useStore>, client: Client, contact: Contact, dealId: string): string | undefined {
  const { s, d } = st
  const deal = (contact.deals ?? []).find((x) => x.id === dealId)
  if (!deal) return
  if (deal.projectId && s.projects.some((p) => p.id === deal.projectId)) return deal.projectId
  const id = uid()
  const fasen = TRAJECTEN.find((t) => t.naam === deal.dienst || t.naam === deal.titel)?.fasen ?? PHASES
  d({ type: 'project:upsert', project: { id, name: deal.titel || 'Nieuw project', soort: 'productie', clientId: client.id, fase: 'productie', contentSoort: 'video', priority: 'middel', bedrag: deal.value || undefined, wie: [deal.owner ?? s.me], createdAt: new Date().toISOString(), updates: [], phases: fasen, doneSteps: [], phase: 0 } })
  d({ type: 'contact:patch', id: contact.id, patch: { stage: 'klant', deals: (contact.deals ?? []).map((x) => (x.id === dealId ? { ...x, stage: 'klant' as Stage, projectId: id } : x)) } })
  return id
}

/** Tab "Offertes" in het klantdossier: dezelfde kaarten als Lopende projecten. Klik = bewerken, slepen naar Lopende projecten = akkoord. Alleen het team. */
export function OffertesTab({ client, onNaarProject }: { client: Client; onNaarProject: (dealId: string) => void }) {
  const { s, d } = useStore()
  const kan = useMag()
  const [open, setOpen] = useState<string | null>(null)
  const contact = s.contacts.find((c) => c.id === client.contactId)
  const offertes = (contact?.deals ?? []).filter((x) => !(x.projectId && s.projects.some((p) => p.id === x.projectId)))
  const stappen = ['lead', 'gemaild', 'voorstel', 'klant']
  const nieuwe = () => {
    const deal: Deal = { id: uid(), titel: '', stage: 'voorstel', value: 0, owner: s.me, createdAt: new Date().toISOString() }
    if (contact) d({ type: 'contact:patch', id: contact.id, patch: { deals: [...(contact.deals ?? []), deal] } })
    else {
      const c: Contact = { id: uid(), name: '', company: client.name, role: '', email: '', phone: '', stage: 'klant', value: 0, owner: s.me, source: '', timeline: [], deals: [deal] }
      d({ type: 'contact:upsert', contact: c })
      d({ type: 'client:upsert', client: { ...client, contactId: c.id } })
    }
    setOpen(deal.id)
  }
  const deal = (contact?.deals ?? []).find((x) => x.id === open)
  return (
    <>
      {offertes.length === 0 && <p className="muted" style={{ margin: '0 0 12px' }}>Nog geen offertes voor {client.name}. Alleen jij ziet dit; de klant ziet in het portaal alleen de pdf-offertes uit Moneybird.</p>}
      <div className="dossier-projecten">
        {offertes.map((x) => {
          const st = ALLE_STAGES.find((y) => y.key === x.stage)
          const i = Math.max(0, stappen.indexOf(x.stage))
          return (
            <button key={x.id} className="dossier-project offerte-kaart" draggable={kan('crm_bewerken')} onClick={() => setOpen(x.id)}
              onDragStart={(e) => { e.dataTransfer.setData('text/rise-offerte', x.id); e.dataTransfer.effectAllowed = 'move' }}>
              <strong>{x.titel || 'Naamloze offerte'}</strong>
              <span className="muted small">{st?.label ?? x.stage}{kan('geld') && x.value ? ` · ${euro(x.value)}` : ''}</span>
              <span className="mini-bar"><i style={{ width: `${((i + 1) / stappen.length) * 100}%` }} /></span>
              <span className="muted small">{[`sinds ${fmtDate(x.createdAt)}`, x.notitie?.trim() ? 'notities' : null].filter(Boolean).join(' · ')}</span>
            </button>
          )
        })}
        {kan('crm_bewerken') && <button className="dossier-project offerte-nieuw" onClick={nieuwe}><Icon name="plus" size={14} /> Offerte</button>}
      </div>
      {deal && contact && <OfferteDrawer contact={contact} deal={deal} onClose={() => setOpen(null)} onNaarProject={(id) => { setOpen(null); onNaarProject(id) }} />}
    </>
  )
}

function OfferteDrawer({ contact, deal, onClose, onNaarProject }: { contact: Contact; deal: Deal; onClose: () => void; onNaarProject: (dealId: string) => void }) {
  const { d } = useStore()
  const kan = useMag()
  const wijzig = (p: Partial<Deal>) => d({ type: 'contact:patch', id: contact.id, patch: { deals: (contact.deals ?? []).map((x) => (x.id === deal.id ? { ...x, ...p } : x)) } })
  const verwijder = () => {
    const oud = contact.deals ?? []
    d({ type: 'contact:patch', id: contact.id, patch: { deals: oud.filter((x) => x.id !== deal.id) } })
    metOngedaan('Offerte verwijderd', () => d({ type: 'contact:patch', id: contact.id, patch: { deals: oud } }))
    onClose()
  }
  return (
    <Drawer open onClose={onClose} wide title={<><div className="drawer-kicker">Offerte · alleen voor jou, de klant ziet dit niet</div>{deal.titel || 'Nieuwe offerte'}</>}>
      <div className="contact-grid">
        <fieldset className="kaal" disabled={!kan('crm_bewerken')}>
          <div className="info-list">
            <div><span className="muted">Naam</span><input className="inline-input" autoFocus={!deal.titel} placeholder="Bijv. Bedrijfsfilm 2027" value={deal.titel} onChange={(e) => wijzig({ titel: e.target.value })} /></div>
            <div><span className="muted">Fase</span>
              <select value={deal.stage} style={{ color: ALLE_STAGES.find((st) => st.key === deal.stage)?.kleur }} onChange={(e) => wijzig({ stage: e.target.value as Stage })}>
                {ALLE_STAGES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
              </select>
            </div>
            {kan('geld') && <div><span className="muted">Bedrag (ex btw)</span><input className="inline-input" type="number" min={0} step={50} placeholder="€ 0" value={deal.value || ''} onChange={(e) => wijzig({ value: Math.max(0, Number(e.target.value) || 0) })} /></div>}
            <div><span className="muted">Opvolgen op</span><input className="inline-input" type="date" value={contact.opvolgen ?? ''} onChange={(e) => d({ type: 'contact:patch', id: contact.id, patch: { opvolgen: e.target.value || undefined } })} /></div>
          </div>
          <h3 className="section-title" style={{ marginTop: 18 }}>Notities <span className="muted small">(gaan nooit mee naar het project of het portaal)</span></h3>
          <textarea className="offerte-notitie" rows={6} placeholder="Wensen, afspraken, prijsopbouw" value={deal.notitie ?? ''} onChange={(e) => wijzig({ notitie: e.target.value })} />
          <button className="btn primary wide" style={{ marginTop: 14 }} disabled={!deal.titel.trim()} onClick={() => onNaarProject(deal.id)}><Icon name="check" size={16} /> Akkoord: naar lopende projecten</button>
          <button className="link small danger" style={{ marginTop: 14 }} onClick={verwijder}>Offerte verwijderen</button>
        </fieldset>
        <div><ContactGeschiedenis contact={contact} /></div>
      </div>
    </Drawer>
  )
}
