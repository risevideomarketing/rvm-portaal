// Zes indelingen voor het klantportaal (keuze per klant: client.portaalIndeling). Zelfde gegevens en dezelfde werkende
// blokken als de oorspronkelijke indeling; alleen de ordening en de vorm verschillen.
import { useState, type ComponentType, type ReactNode } from 'react'
import { WeekResultaten } from '../components/Weekcijfers'
import { ContentBekijken, ContentKalender, StatusPil, isMail } from '../components/ContentKalender'
import { FrameEmbed } from '../components/FrameEmbed'
import { StrippenkaartKlant, stripTelling } from '../components/Strippenkaart'
import { Icon } from '../components/ui'
import { openLink } from '../bestanden'
import { faseVan, fasenVan } from '../data/mock'
import { NotionInhoud } from '../components/NotionInhoud'
import { artikelenNu } from '../kennis'
import type { Client, ContentItem, KlantTaak, ProductieFase } from '../data/types'
import { bronVan, pakketNaam } from '../utils'
import { CommissieKaart, ContentKaart, FacturenKaart, HulpvraagKaart, OffertesKaart, ONBOARDING_KLANT, type PortaalProps } from './Portaal'

type P = PortaalProps & { facturen: boolean }

const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
const MND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const kort = (d: string) => `${Number(d.slice(8, 10))} ${MND[Number(d.slice(5, 7)) - 1]}`
const lang = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

interface Moment { id: string; datum: string; titel: string; soort: 'content' | 'planning' | 'taak' | 'klaar'; label: string; item?: ContentItem; taak?: KlantTaak }

/** Alles wat elke indeling nodig heeft, één keer uitgerekend. */
function gegevens(client: Client) {
  const vandaag = iso(new Date())
  const fasen = fasenVan(client)
  const traject = fasen.slice(1)
  const onboarding = client.phase === 0
  const huidig = Math.min(client.phase, fasen.length - 1) - 1
  const taken = client.klantTaken ?? []
  const open = taken.filter((t) => !t.done).sort((a, b) => (a.deadline ?? '9').localeCompare(b.deadline ?? '9'))
  const klaar = taken.filter((t) => t.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  const content = (client.contentKalender ?? []).filter((i) => (client.kanalen ?? []).includes(i.kanaal))
  const eigen = client.planning ?? []
  const planning = [...eigen, ...(client.nextShoot && !eigen.some((p) => p.date === client.nextShoot) ? [{ id: 'shoot', date: client.nextShoot, title: 'Shootdag' }] : [])]
  const momenten: Moment[] = [
    ...content.filter((i) => i.datum).map((i) => ({ id: `c-${i.id}`, datum: i.datum!, titel: i.titel, soort: 'content' as const, label: `${isMail(i.kanaal) ? 'Mail' : 'Post'} · ${i.kanaal}`, item: i })),
    ...planning.map((p) => ({ id: `p-${p.id}`, datum: p.date, titel: p.title, soort: 'planning' as const, label: 'Planning' })),
    ...open.filter((t) => t.deadline).map((t) => ({ id: `t-${t.id}`, datum: t.deadline!, titel: t.title, soort: 'taak' as const, label: 'Voor jou', taak: t })),
  ].sort((a, b) => a.datum.localeCompare(b.datum))
  const komend = momenten.filter((m) => m.datum >= vandaag)
  const geweest: Moment[] = [
    ...momenten.filter((m) => m.datum < vandaag && m.soort !== 'taak'),
    ...klaar.filter((t) => t.doneAt).map((t) => ({ id: `k-${t.id}`, datum: t.doneAt!.slice(0, 10), titel: t.title, soort: 'klaar' as const, label: 'Door jou gedaan', taak: t })),
  ].sort((a, b) => a.datum.localeCompare(b.datum)).slice(-4)
  return {
    vandaag, fasen, traject, onboarding, huidig, open, klaar, content, komend, geweest,
    titel: onboarding ? 'We zetten alles klaar' : faseVan(client).klantLabel,
    stap: onboarding ? 'Onboarding' : `Fase ${huidig + 1} van ${traject.length}`,
    procent: Math.round((Math.max(0, huidig + 1) / Math.max(1, traject.length)) * 100),
    volgendeContent: content.filter((i) => i.datum && i.datum >= vandaag).sort((a, b) => a.datum!.localeCompare(b.datum!))[0],
    volgendePlanning: planning.filter((p) => p.date >= vandaag).sort((a, b) => a.date.localeCompare(b.date))[0],
    links: (client.links ?? []).filter((l) => l.klant),
    kennis: artikelenNu().filter((a) => a.klant && (!a.klanten?.length || a.klanten.includes(client.id))),
    pakket: client.pakket ? pakketNaam(client.pakket) : '',
  }
}
type G = ReturnType<typeof gegevens>

/* ── Kleine bouwstenen ─────────────────────────────────────────────── */

function Kop({ client, actions, donker = false, children }: { client: Client; actions?: ReactNode; donker?: boolean; children?: ReactNode }) {
  return (
    <header className={`pi-kop ${donker ? 'donker' : ''}`}>
      <div className="pi-kop-rij">
        <img src={donker ? '/img/logo-wit.png' : '/img/logo-navy.png'} alt="Rise Video Marketing" />
        <span className="pi-klant">{client.name}{actions}</span>
      </div>
      {children}
    </header>
  )
}

function Balkje({ procent, licht = false }: { procent: number; licht?: boolean }) {
  return <div className={`pi-balkje ${licht ? 'licht' : ''}`}><i style={{ width: `${Math.max(4, procent)}%` }} /></div>
}

/** Eén taak voor de klant, afvinkbaar (alleen als de klant zelf is ingelogd). */
function ActieRij({ t, onTaak, compact = false }: { t: KlantTaak; onTaak?: P['onTaak']; compact?: boolean }) {
  const [bezig, setBezig] = useState(false)
  const klik = async () => { if (!onTaak) return; setBezig(true); await onTaak(t.id, !t.done); setBezig(false) }
  return (
    <div className={`pi-actie ${t.done ? 'af' : ''}`}>
      <button className={`pi-vink ${t.done ? 'aan' : ''}`} disabled={bezig} onClick={klik} aria-label={t.done ? `${t.title} weer openzetten` : `${t.title} afvinken`} title={onTaak ? 'Afvinken' : 'Alleen de klant kan afvinken'}>{t.done && <Icon name="check" size={12} />}</button>
      <span className="pi-actie-tekst"><span className="pi-actie-titel">{t.title}</span>{!compact && t.description && <span className="pi-sub">{t.description}</span>}</span>
      {!t.done && t.deadline && <span className="pi-pil pi-pil-datum">vóór {kort(t.deadline)}</span>}
    </div>
  )
}

function Datumblok({ d }: { d: string }) {
  return <span className="pi-datum"><b>{Number(d.slice(8, 10))}</b><span>{MND[Number(d.slice(5, 7)) - 1]}</span></span>
}

/** Mail, post, planning of taak als regel met datum. Content opent de volledige tekst. */
function MomentRij({ m, onOpen }: { m: Moment; onOpen: (i: ContentItem) => void }) {
  const inhoud = (
    <>
      <Datumblok d={m.datum} />
      <span className="pi-moment-tekst"><span className={`pi-soort s-${m.soort}`}>{m.label}</span><span className="pi-moment-titel">{m.titel}</span></span>
      {m.item && <StatusPil s={m.item.status} />}
    </>
  )
  return m.item ? <button className="pi-moment klikbaar" onClick={() => onOpen(m.item!)}>{inhoud}</button> : <div className="pi-moment">{inhoud}</div>
}

function Momenten({ lijst, leeg, max = 8 }: { lijst: Moment[]; leeg: string; max?: number }) {
  const [open, setOpen] = useState<ContentItem | null>(null)
  return (
    <>
      {lijst.length === 0 ? <p className="pi-leeg">{leeg}</p> : <div className="pi-momenten">{lijst.slice(0, max).map((m) => <MomentRij key={m.id} m={m} onOpen={setOpen} />)}</div>}
      {open && <ContentBekijken item={open} klant onClose={() => setOpen(null)} />}
    </>
  )
}

function Bestanden({ g }: { g: G }) {
  return g.links.length === 0
    ? <p className="pi-leeg">Hier komen je brand guidelines, mappen en documenten.</p>
    : <div className="pi-lijst">{g.links.map((l) => <a key={l.id} className="pi-link" href={l.url} target="_blank" rel="noreferrer"><Icon name="note" size={15} /><span>{l.title}</span><Icon name="external" size={13} /></a>)}</div>
}

function Kennis({ g }: { g: G }) {
  return (
    <div className="pi-lijst pi-kennis">
      {g.kennis.map((a) => (
        <details key={a.id}>
          <summary><Icon name="book" size={15} /><span>{a.title}</span></summary>
          <p className="pi-sub">{a.summary}</p>
          {a.notion ? <NotionInhoud md={a.notion} afb={a.afbeeldingen} /> : <>{a.steps && <ol>{a.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>}{a.body.map((p, i) => <p key={i} className="pi-sub">{p}</p>)}</>}
          {a.videoUrl && <a className="link small" href={a.videoUrl} target="_blank" rel="noreferrer">Bekijk de uitlegvideo</a>}
        </details>
      ))}
    </div>
  )
}

function Onboarding({ client, g }: { client: Client; g: G }) {
  if (!g.onboarding) return null
  return (
    <ul className="pi-onboarding">
      {g.fasen[0].steps.map((st) => <li key={st} className={client.doneSteps.includes(st) ? 'af' : ''}><Icon name={client.doneSteps.includes(st) ? 'check' : 'arrow'} size={13} />{ONBOARDING_KLANT[st] ?? st}</li>)}
    </ul>
  )
}

function ContentKalenderBlok({ client }: { client: Client }) {
  return (client.kanalen ?? []).length ? <ContentKalender client={client} klant /> : <p className="pi-leeg">Hier komt de planning van je mails en posts zodra die er is.</p>
}

/* ── 1 · Cockpit (standaard): logica van de Cockpit, stijl van het live portaal ── */
function Cockpit(p: P) {
  const { client } = p
  const g = gegevens(client)
  const heeftKalender = (client.kanalen ?? []).length > 0
  const tabs = [
    ...(heeftKalender ? [{ key: 'content', label: 'Contentkalender' }] : []),
    { key: 'bestanden', label: 'Content & bestanden' },
    { key: 'resultaten', label: 'Resultaten' },
    { key: 'planning', label: 'Planning' },
    ...(p.facturen ? [{ key: 'facturen', label: 'Facturen' }] : []),
    { key: 'kennis', label: 'Kennisbank' },
  ]
  const [tab, setTab] = useState(tabs[0].key)
  return (
    <div className="portal pl">
      <header className="portal-head">
        <img src="/img/logo-navy.png" alt="Rise Video Marketing" />
        <span className="muted small">{client.name}{p.actions}</span>
      </header>

      {g.onboarding && (
        <section className="portal-welcome portal-onboarding">
          <Icon name="check" size={22} />
          <div>
            <h3>Welkom bij Rise Video Marketing</h3>
            <p>Eerst regelen we samen de onboarding. Daarna zie je hier je traject, de planning en al je content.</p>
            <ul className="checklist" style={{ marginTop: 10 }}>
              {g.fasen[0].steps.map((st) => <li key={st} className={client.doneSteps.includes(st) ? 'done' : ''}>{client.doneSteps.includes(st) ? '✓' : '○'} {ONBOARDING_KLANT[st] ?? st}</li>)}
            </ul>
          </div>
          {client.onboardingVideoUrl && <a className="btn light" href={client.onboardingVideoUrl} target="_blank" rel="noreferrer">Welkomstvideo <Icon name="external" size={14} /></a>}
        </section>
      )}

      {/* 1. Eerst wat de klant moet doen */}
      <section className="portal-card pl-acties">
        <Icon name="check" size={22} />
        <h3>{g.open.length ? `Wat we van je nodig hebben (${g.open.length})` : 'Alles is binnen, dank je!'}</h3>
        <p className="muted">{g.open.length ? 'Vink het af zodra het gedaan is. Dan weten wij dat we verder kunnen.' : 'Wij zijn aan de slag. Hieronder zie je wat eraan komt.'}</p>
        {(g.open.length > 0 || g.klaar.length > 0) && (
          <div className="pl-actielijst">
            {g.open.map((t) => <ActieRij key={t.id} t={t} onTaak={p.onTaak} />)}
            {g.klaar.slice(0, 2).map((t) => <ActieRij key={t.id} t={t} onTaak={p.onTaak} compact />)}
          </div>
        )}
      </section>

      {/* 2. Vier cijfers */}
      <div className="pl-tegels">
        <div className="portal-card pl-tegel"><span className="portal-kicker">Traject</span><strong className="pi-groot tekst">{g.titel}</strong><span className="muted small">{g.stap}</span><Balkje procent={g.procent} /></div>
        <div className="portal-card pl-tegel"><span className="portal-kicker">Open voor jou</span><strong className="pi-groot">{g.open.length}</strong><span className="muted small pl-sub">{g.open[0]?.deadline ? `eerste vóór ${kort(g.open[0].deadline)}` : 'niets openstaand'}</span></div>
        <div className="portal-card pl-tegel"><span className="portal-kicker">Volgende {g.volgendeContent && isMail(g.volgendeContent.kanaal) ? 'mail' : 'post'}</span><strong className="pi-groot tekst">{g.volgendeContent ? kort(g.volgendeContent.datum!) : '—'}</strong><span className="muted small pl-sub">{g.volgendeContent?.titel ?? 'nog niets gepland'}</span></div>
        <div className="portal-card pl-tegel"><span className="portal-kicker">Volgende moment</span><strong className="pi-groot tekst">{g.volgendePlanning ? kort(g.volgendePlanning.date) : '—'}</strong><span className="muted small pl-sub">{g.volgendePlanning?.title ?? 'nog niets gepland'}</span></div>
      </div>

      {/* 3. De rest achter tabbladen */}
      <div className="pl-tabs pi-tabs" role="tablist">{tabs.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}</div>

      {tab === 'bestanden' ? (
        <div className="pl-content">
          <LinksEnDocumenten client={client} g={g} onContent={p.onContent} />
          <section className="portal-card pl-frame">
            <Icon name="play" size={22} />
            <h3>Video's en feedback</h3>
            {client.frameUrl
              ? <FrameEmbed url={client.frameUrl} />
              : <p className="muted">Hier verschijnen je video's in Frame.io zodra we ze klaarzetten. Daar geef je ook feedback.</p>}
          </section>
        </div>
      ) : (
        <div className="pl-onder">
          <div className="pl-paneel">
            {tab === 'content' && <section className="portal-card"><Icon name="calendar" size={22} /><h3>Contentkalender</h3><p className="muted">Wat we wanneer versturen en plaatsen. Klik op een item voor de volledige tekst.</p><ContentKalender client={client} klant /></section>}
            {tab === 'resultaten' && <><WeekResultaten client={client} />{p.facturen && client.commissiePct && client.metaAdAccount ? <CommissieKaart clientId={client.id} /> : null}</>}
            {tab === 'planning' && <section className="portal-card"><Icon name="calendar" size={22} /><h3>Planning</h3><Momenten lijst={g.komend.filter((m) => m.soort !== 'content')} leeg="We zetten hier de shootdag, de livegang en andere vaste momenten zodra ze vaststaan." /></section>}
            {tab === 'facturen' && <FacturenKaart clientId={client.id} />}
            {tab === 'kennis' && <section className="portal-card"><Icon name="book" size={22} /><h3>Kennisbank</h3><Kennis g={g} /></section>}
          </div>
          <div className="pl-hulp"><HulpvraagKaart vragen={client.hulpvragen ?? []} onVraag={p.onVraag} /></div>
        </div>
      )}
    </div>
  )
}

/** Smalle kolom bij Content & bestanden: alle mappen, links en documenten, plus een eigen map toevoegen. */
function LinksEnDocumenten({ client, g, onContent }: { client: Client; g: G; onContent?: P['onContent'] }) {
  const plekken = client.contentPlekken ?? []
  const [open, setOpen] = useState(false)
  const [titel, setTitel] = useState('')
  const [url, setUrl] = useState('')
  const [wegId, setWegId] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const doe = async (body: Parameters<NonNullable<P['onContent']>>[0]) => {
    if (!onContent) return setFout('Dit werkt alleen als de klant zelf is ingelogd.')
    setBezig(true); setFout('')
    const r = await onContent(body)
    setBezig(false)
    if (r) return setFout(r)
    setTitel(''); setUrl(''); setOpen(false); setWegId(null)
  }
  return (
    <section className="portal-card pl-links">
      <Icon name="note" size={22} />
      <h3>Links & documenten</h3>
      <div className="pi-lijst">
        {plekken.map((pl) => (
          <div key={pl.id} className="pl-link-rij">
            <a className="pi-link" href={pl.url} target="_blank" rel="noreferrer"><Icon name="folder" size={15} /><span>{pl.title}<span className="pi-sub">{[bronVan(pl.url) !== pl.title && bronVan(pl.url), pl.door === 'klant' && 'door jou toegevoegd'].filter(Boolean).join(' · ') || 'Map met content'}</span></span><Icon name="external" size={13} /></a>
            {pl.door === 'klant' && (wegId === pl.id
              ? <span className="pl-weg"><span className="small">Weghalen? Ook wij zien hem dan niet meer.</span><button className="btn small" disabled={bezig} onClick={() => doe({ actie: 'weg', id: pl.id })}>Ja</button><button className="link small" onClick={() => setWegId(null)}>Nee</button></span>
              : <button className="link small pl-weg-knop" onClick={() => setWegId(pl.id)}>Weghalen…</button>)}
          </div>
        ))}
        {g.links.map((l) => <a key={l.id} className="pi-link" href={l.url} target="_blank" rel="noreferrer"><Icon name="note" size={15} /><span>{l.title}</span><Icon name="external" size={13} /></a>)}
        {!plekken.length && !g.links.length && <p className="pi-leeg">Hier komen je mappen, brand guidelines en andere documenten.</p>}
      </div>
      {open ? (
        <div className="pl-form">
          <input placeholder="Naam, bijv. Foto's voor de website" value={titel} onChange={(e) => setTitel(e.target.value)} />
          <input placeholder="Link naar je map (Drive, SharePoint…)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && url.trim() && doe({ actie: 'toevoegen', titel, url })} />
          <div><button className="btn primary small" disabled={!url.trim() || bezig} onClick={() => doe({ actie: 'toevoegen', titel, url })}>Toevoegen</button> <button className="link small" onClick={() => setOpen(false)}>Annuleren</button></div>
        </div>
      ) : <button className="btn small" onClick={() => setOpen(true)}><Icon name="plus" size={14} /> Eigen map toevoegen</button>}
      {fout && <p className="small danger-tekst" style={{ margin: '6px 0 0' }}>{fout}</p>}
    </section>
  )
}

/* ── 2 · Tabbladen ───────────────────────────────────────────────── */
function Tabbladen(p: P) {
  const { client } = p
  const g = gegevens(client)
  const tabs = [
    { key: 'overzicht', label: 'Overzicht', tel: g.open.length },
    { key: 'content', label: 'Content' },
    { key: 'resultaten', label: 'Resultaten' },
    { key: 'documenten', label: 'Documenten' },
    { key: 'hulp', label: 'Hulp' },
  ]
  const [tab, setTab] = useState('overzicht')
  return (
    <div className="portal pi pi-2">
      <Kop client={client} actions={p.actions} donker>
        <h2 className="pi2-titel">{g.titel}</h2>
        <ol className="pi2-fasen">
          {(g.onboarding ? [{ key: 'onb', klantLabel: 'Onboarding' }, ...g.traject] : g.traject).map((f, i) => {
            const idx = g.onboarding ? i - 1 : i
            return <li key={f.key} className={idx < g.huidig ? 'af' : idx === g.huidig || (g.onboarding && i === 0) ? 'nu' : ''}><i /><span>{f.klantLabel}</span></li>
          })}
        </ol>
        <nav className="pi2-tabs" role="tablist">{tabs.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}{t.tel ? <b className="pi-tel">{t.tel}</b> : null}</button>)}</nav>
      </Kop>
      <div className="pi-body pi2-body">
        <div className="pi2-hoofd">
          {tab === 'overzicht' && (
            <>
              {g.onboarding && <div className="pi-kaart"><h3 className="pi-h3">Welkom bij Rise Video Marketing</h3><p className="pi-sub">Eerst regelen we samen de onboarding.</p><Onboarding client={client} g={g} /></div>}
              <div className="pi-kaart"><h3 className="pi-h3">Wat eraan komt</h3><Momenten lijst={g.komend} leeg="Nog niets gepland." /></div>
            </>
          )}
          {tab === 'content' && <><div className="pi-kaart"><ContentKalenderBlok client={client} /></div><ContentKaart client={client} onContent={p.onContent} /></>}
          {tab === 'resultaten' && <><WeekResultaten client={client} />{p.facturen && client.commissiePct && client.metaAdAccount ? <CommissieKaart clientId={client.id} /> : null}</>}
          {tab === 'documenten' && <><div className="pi-kaart"><h3 className="pi-h3">Bestanden & links</h3><Bestanden g={g} /></div><div className="pi-kaart"><h3 className="pi-h3">Kennisbank</h3><Kennis g={g} /></div>{p.facturen && <FacturenKaart clientId={client.id} />}</>}
          {tab === 'hulp' && <HulpvraagKaart vragen={client.hulpvragen ?? []} onVraag={p.onVraag} />}
        </div>
        <aside className="pi2-zij">
          <div className="pi-kaart pi-rand-actie"><h3 className="pi-h3">Jouw acties</h3>{g.open.length ? g.open.map((t) => <ActieRij key={t.id} t={t} onTaak={p.onTaak} compact />) : <p className="pi-leeg">Niets openstaand. Dank je!</p>}</div>
          <div className="pi-kaart"><h3 className="pi-h3">Volgende moment</h3>{g.komend[0] ? <p><strong>{lang(g.komend[0].datum)}</strong><br /><span className="pi-sub">{g.komend[0].titel}</span></p> : <p className="pi-leeg">Nog niets gepland.</p>}</div>
        </aside>
      </div>
    </div>
  )
}

/* ── 3 · Bento ───────────────────────────────────────────────────── */
function Bento(p: P) {
  const { client } = p
  const g = gegevens(client)
  return (
    <div className="portal pi pi-3">
      <Kop client={client} actions={p.actions} donker />
      <div className="pi-body pi3-raster">
        <section className="pi3-b pi3-welkom">
          <span className="pi-label licht">Jouw traject{g.pakket ? ` · ${g.pakket}` : ''} · {g.stap.toLowerCase()}</span>
          <h2>{g.titel}</h2>
          <Balkje procent={g.procent} licht />
          {g.volgendePlanning && <p>Volgende moment: {g.volgendePlanning.title} op {lang(g.volgendePlanning.date)}</p>}
          <Onboarding client={client} g={g} />
        </section>
        <section className={`pi3-b pi3-actie ${g.open.length || g.klaar.length ? '' : 'leeg'}`}>
          <span className="pi-ico oranje"><Icon name="check" size={18} /></span>
          <h3 className="pi-h3">{g.open.length ? 'Wat we van je nodig hebben' : 'Alles is binnen'}</h3>
          {g.open.map((t) => <ActieRij key={t.id} t={t} onTaak={p.onTaak} compact />)}
          {g.klaar.slice(0, 2).map((t) => <ActieRij key={t.id} t={t} onTaak={p.onTaak} compact />)}
          {!g.open.length && !g.klaar.length && <p className="pi-leeg">Er staat niets voor je klaar.</p>}
        </section>
        <section className="pi3-b pi3-content">
          <span className="pi-ico teal"><Icon name="mail" size={18} /></span>
          <h3 className="pi-h3">Contentkalender</h3>
          <ContentKalenderBlok client={client} />
        </section>
        <section className="pi3-b pi3-plan">
          <h3 className="pi-h3">Planning</h3>
          <Momenten lijst={g.komend.filter((m) => m.soort === 'planning')} leeg="Shootdag en livegang komen hier zodra ze vaststaan." max={4} />
        </section>
        <section className="pi3-b pi3-mappen"><ContentKaart client={client} onContent={p.onContent} /></section>
        <section className="pi3-b pi3-best"><h3 className="pi-h3">Bestanden & kennisbank</h3><Bestanden g={g} /><Kennis g={g} /></section>
        {p.facturen && <section className="pi3-b pi3-fac"><FacturenKaart clientId={client.id} /></section>}
        <section className="pi3-b pi3-hulp"><HulpvraagKaart vragen={client.hulpvragen ?? []} onVraag={p.onVraag} /></section>
        <section className="pi3-b pi3-res"><WeekResultaten client={client} />{p.facturen && client.commissiePct && client.metaAdAccount ? <CommissieKaart clientId={client.id} /> : null}</section>
      </div>
    </div>
  )
}

/* ── 4 · Tijdlijn ────────────────────────────────────────────────── */
function Tijdlijn(p: P) {
  const { client } = p
  const g = gegevens(client)
  const [open, setOpen] = useState<ContentItem | null>(null)
  const zonderDatum = g.open.filter((t) => !t.deadline)
  const Punt = ({ m }: { m: Moment }) => (
    <li className={`pi4-moment s-${m.soort}`}>
      <i />
      <div className="pi-kaart">
        <span className={`pi-soort s-${m.soort}`}>{m.label} · {kort(m.datum)}</span>
        {m.taak && m.soort === 'taak' ? <ActieRij t={m.taak} onTaak={p.onTaak} compact />
          : m.item ? <button className="pi4-titel klikbaar" onClick={() => setOpen(m.item!)}><span>{m.titel}</span><StatusPil s={m.item.status} /></button>
            : <span className="pi4-titel"><span>{m.titel}</span></span>}
      </div>
    </li>
  )
  return (
    <div className="portal pi pi-4">
      <Kop client={client} actions={p.actions} donker />
      <div className="pi-body pi4-body">
        <div>
          <ol className="pi4-lijn">
            {g.geweest.length > 0 && <li className="pi4-kop">Gedaan</li>}
            {g.geweest.map((m) => <Punt key={m.id} m={m} />)}
            <li className="pi4-vandaag"><span>Vandaag · {lang(g.vandaag)}</span></li>
            {zonderDatum.map((t) => <Punt key={t.id} m={{ id: t.id, datum: g.vandaag, titel: t.title, soort: 'taak', label: 'Voor jou', taak: t }} />)}
            {g.komend.map((m) => <Punt key={m.id} m={m} />)}
            {g.komend.length === 0 && zonderDatum.length === 0 && <li className="pi4-leeg">Nog niets gepland. Zodra de shootdag, mails en posts vaststaan, verschijnen ze hier.</li>}
          </ol>
          <WeekResultaten client={client} />
        </div>
        <aside className="pi4-zij">
          <div className="pi-kaart"><span className="pi-label">Traject</span><strong className="pi-groot tekst">{g.stap}</strong><span className="pi-sub">{g.titel}</span><Balkje procent={g.procent} /></div>
          <ContentKaart client={client} onContent={p.onContent} />
          <div className="pi-kaart"><h3 className="pi-h3">Bestanden & links</h3><Bestanden g={g} /></div>
          <div className="pi-kaart"><h3 className="pi-h3">Kennisbank</h3><Kennis g={g} /></div>
          {p.facturen && <FacturenKaart clientId={client.id} />}
          <HulpvraagKaart vragen={client.hulpvragen ?? []} onVraag={p.onVraag} />
        </aside>
      </div>
      {open && <ContentBekijken item={open} klant onClose={() => setOpen(null)} />}
    </div>
  )
}

/* ── 5 · Verhaal ─────────────────────────────────────────────────── */
function Verhaal(p: P) {
  const { client } = p
  const g = gegevens(client)
  const hoofdstukken = ['Waar staan we', 'Wat we van je nodig hebben', 'Wat eraan komt', 'Hoe het gaat', 'Documenten', 'Hulp']
  const naar = (i: number) => document.getElementById(`pi5-h${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const zin = g.onboarding
    ? <>We zitten in de <strong>onboarding</strong>{g.volgendePlanning ? <>. Het volgende moment is <strong>{g.volgendePlanning.title}</strong> op <strong>{lang(g.volgendePlanning.date)}</strong></> : null}.</>
    : <>We zitten in de fase <strong>{g.titel.toLowerCase()}</strong> ({g.stap.toLowerCase()}){g.volgendePlanning ? <>. Daarna volgt <strong>{g.volgendePlanning.title}</strong> op <strong>{lang(g.volgendePlanning.date)}</strong></> : null}.</>
  return (
    <div className="portal pi pi-5">
      <Kop client={client} actions={p.actions} donker />
      <div className="pi5-body">
        <nav className="pi5-toc">{hoofdstukken.map((h, i) => <button key={h} onClick={() => naar(i)}><b>{i + 1}</b><span>{h}</span></button>)}</nav>
        <div className="pi5-verhaal">
          <section id="pi5-h0"><div className="pi5-kop"><b>01</b><h2>Waar staan we</h2></div><p className="pi5-zin">{zin}</p><Balkje procent={g.procent} /><Onboarding client={client} g={g} /></section>
          <section id="pi5-h1"><div className="pi5-kop"><b>02</b><h2>Wat we van je nodig hebben</h2></div>
            {g.open.length || g.klaar.length
              ? <div className="pi5-acties">{[...g.open, ...g.klaar.slice(0, 2)].map((t) => <div key={t.id} className={`pi-kaart ${t.done ? 'af' : 'open'}`}><ActieRij t={t} onTaak={p.onTaak} /></div>)}</div>
              : <p className="pi5-zin">Op dit moment niets. Wij zijn aan de slag.</p>}
          </section>
          <section id="pi5-h2"><div className="pi5-kop"><b>03</b><h2>Wat eraan komt</h2></div><div className="pi-kaart"><Momenten lijst={g.komend} leeg="Nog niets gepland." /></div>{(client.kanalen ?? []).length > 0 && <div className="pi-kaart" style={{ marginTop: 12 }}><ContentKalenderBlok client={client} /></div>}</section>
          <section id="pi5-h3"><div className="pi5-kop"><b>04</b><h2>Hoe het gaat</h2></div><WeekResultaten client={client} />{p.facturen && client.commissiePct && client.metaAdAccount ? <CommissieKaart clientId={client.id} /> : null}</section>
          <section id="pi5-h4"><div className="pi5-kop"><b>05</b><h2>Documenten</h2></div><div className="pi5-twee"><ContentKaart client={client} onContent={p.onContent} /><div className="pi-kaart"><h3 className="pi-h3">Bestanden & links</h3><Bestanden g={g} /><h3 className="pi-h3" style={{ marginTop: 14 }}>Kennisbank</h3><Kennis g={g} /></div></div>{p.facturen && <FacturenKaart clientId={client.id} />}</section>
          <section id="pi5-h5"><div className="pi5-kop"><b>06</b><h2>Hulp</h2></div><HulpvraagKaart vragen={client.hulpvragen ?? []} onVraag={p.onVraag} /></section>
        </div>
      </div>
    </div>
  )
}

/* ── 6 · Jij · Rise · Klaar ──────────────────────────────────────── */
function JijRiseKlaar(p: P) {
  const { client } = p
  const g = gegevens(client)
  const [open, setOpen] = useState<ContentItem | null>(null)
  const bezig = [
    ...g.content.filter((i) => i.status !== 'klaar').sort((a, b) => (a.datum ?? '9').localeCompare(b.datum ?? '9')).map((i) => ({ id: i.id, soort: `${isMail(i.kanaal) ? 'Mail' : 'Post'}${i.datum ? ` · ${kort(i.datum)}` : ''}`, titel: i.titel, item: i })),
    ...g.komend.filter((m) => m.soort === 'planning').map((m) => ({ id: m.id, soort: `Planning · ${kort(m.datum)}`, titel: m.titel, item: undefined as ContentItem | undefined })),
  ]
  const klaar = [
    ...g.klaar.map((t) => ({ id: t.id, soort: t.doneAt ? `Door jou · ${kort(t.doneAt.slice(0, 10))}` : 'Door jou', titel: t.title, item: undefined as ContentItem | undefined })),
    ...g.content.filter((i) => i.status === 'klaar').map((i) => ({ id: i.id, soort: `${isMail(i.kanaal) ? 'Mail' : 'Post'} klaar${i.datum ? ` · ${kort(i.datum)}` : ''}`, titel: i.titel, item: i })),
    ...client.doneSteps.slice(-3).map((st) => ({ id: st, soort: 'Onboarding', titel: ONBOARDING_KLANT[st] ?? st, item: undefined as ContentItem | undefined })),
  ]
  const Ding = ({ d }: { d: { id: string; soort: string; titel: string; item?: ContentItem } }) => (
    <div className={`pi6-ding ${d.item ? 'klikbaar' : ''}`} onClick={() => d.item && setOpen(d.item)} role={d.item ? 'button' : undefined}>
      <span className="pi-soort">{d.soort}</span>
      <span className="pi6-titel">{d.titel}</span>
      {d.item && <StatusPil s={d.item.status} />}
    </div>
  )
  return (
    <div className="portal pi pi-6">
      <Kop client={client} actions={p.actions} donker />
      <div className="pi-body">
        <div className="pi6-status"><strong>{g.titel}</strong><span className="pi-sub">{g.stap}</span><Balkje procent={g.procent} />{g.volgendePlanning && <span className="pi-sub">Volgende: {g.volgendePlanning.title} · {kort(g.volgendePlanning.date)}</span>}</div>
        <div className="pi6-kolommen">
          <section className="pi6-kolom jij"><div className="pi6-kop"><span className="pi-ico oranje"><Icon name="check" size={16} /></span><h3>Bij jou</h3><b>{g.open.length}</b></div>
            {g.open.length ? g.open.map((t) => <div key={t.id} className="pi6-ding"><ActieRij t={t} onTaak={p.onTaak} /></div>) : <p className="pi-leeg">Niets. Wij hebben de bal.</p>}
          </section>
          <section className="pi6-kolom rise"><div className="pi6-kop"><span className="pi-ico blauw"><Icon name="arrow" size={16} /></span><h3>Rise is bezig</h3><b>{bezig.length}</b></div>
            {bezig.length ? bezig.map((d) => <Ding key={d.id} d={d} />) : <p className="pi-leeg">Hier zie je waar we aan werken.</p>}
          </section>
          <section className="pi6-kolom klaar"><div className="pi6-kop"><span className="pi-ico groen"><Icon name="check" size={16} /></span><h3>Klaar</h3><b>{klaar.length}</b></div>
            {klaar.length ? klaar.slice(0, 8).map((d) => <Ding key={d.id} d={d} />) : <p className="pi-leeg">Wat af is, komt hier.</p>}
          </section>
        </div>
        <WeekResultaten client={client} />
        <div className="pi6-onder">
          <ContentKaart client={client} onContent={p.onContent} />
          <div className="pi-kaart"><h3 className="pi-h3">Bestanden & kennisbank</h3><Bestanden g={g} /><Kennis g={g} /></div>
          {p.facturen && <FacturenKaart clientId={client.id} />}
          <HulpvraagKaart vragen={client.hulpvragen ?? []} onVraag={p.onVraag} />
        </div>
        {(client.kanalen ?? []).length > 0 && <div className="pi-kaart" style={{ marginTop: 16 }}><h3 className="pi-h3">Contentkalender</h3><ContentKalenderBlok client={client} /></div>}
      </div>
      {open && <ContentBekijken item={open} klant onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Index 0 = de oorspronkelijke indeling (in Portaal.tsx). */

/* ── Service (standaard voor Rise Video Marketing): de klant hoeft niets te doen, hij ziet wat hij krijgt ── */
const FASE_STAP: Record<ProductieFase, number> = { productie: 1, filmen: 2, edit1: 3, edit2: 4, feedback: 4, live: 5 }
/** Wat we op dit moment doen, per fase (voor de klant). */
const FASE_NU: Record<ProductieFase, string> = {
  productie: 'We bereiden de opnames voor: concept, script en planning',
  filmen: 'We zijn aan het filmen',
  edit1: 'We monteren de eerste versie',
  edit2: 'We verwerken je feedback en maken de video af',
  feedback: 'De versie staat klaar, we wachten op jouw feedback',
  live: 'Opgeleverd',
}
const STAPPEN = ['Voorbereiding', 'Filmen', 'Montage', 'Feedback', 'Opgeleverd']

/** Statusbalk per video: vijf stappen, de huidige gemarkeerd, en wat we nu doen. */
function VideoStatus({ x, vandaag }: { x: { id: string; name: string; fase: ProductieFase; deadline?: string }; vandaag: string }) {
  const stap = FASE_STAP[x.fase]
  return (
    <li className="sv-video">
      <div className="sv-video-kop"><strong>{x.name}</strong>{x.deadline && x.deadline >= vandaag && <span className="sv-video-datum">verwacht rond {kort(x.deadline)}</span>}</div>
      <ol className="sv-video-stappen" aria-label={`Stap ${stap} van 5`}>
        {STAPPEN.map((naam, i) => <li key={naam} className={i + 1 < stap ? 'klaar' : i + 1 === stap ? 'nu' : ''}><i /><span>{naam}</span></li>)}
      </ol>
      <span className="sv-video-nu">Nu: {FASE_NU[x.fase]}</span>
    </li>
  )
}


/** De klant levert zelf iets aan: een link, een bestand of een datum. Komt bij Rise binnen als taak. */
function KlantToevoegen({ client, onToevoegen }: { client: Client; onToevoegen?: P['onToevoegen'] }) {
  const [soort, setSoort] = useState<'link' | 'bestand' | 'datum'>('link')
  const [titel, setTitel] = useState('')
  const [url, setUrl] = useState('')
  const [datum, setDatum] = useState('')
  const [bestand, setBestand] = useState<File | null>(null)
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null)
  const [alles, setAlles] = useState(false)
  const alleEigen = [
    ...(client.links ?? []).filter((l) => (l as { doorKlant?: boolean }).doorKlant).map((l) => ({ id: l.id, naam: l.title, at: l.at, open: async () => l.url })),
    ...(client.bestanden ?? []).filter((b) => (b as { doorKlant?: boolean }).doorKlant).map((b) => ({ id: b.id, naam: b.naam, at: b.at, open: () => openLink(b) })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const eigen = alles ? alleEigen : alleEigen.slice(0, 5)
  const openen = async (x: { open: () => Promise<string | null | undefined> }) => {
    // Venster direct openen (anders blokkeert de browser de pop-up), daarna de tijdelijke link erin zetten
    const w = window.open('', '_blank')
    const url = await x.open()
    if (url && w) w.location.href = url
    else { w?.close(); setMelding({ ok: false, tekst: 'Openen lukte niet. Probeer het later nog eens.' }) }
  }
  const klaar = soort === 'link' ? url.trim().length > 3 : soort === 'datum' ? Boolean(datum && titel.trim()) : Boolean(bestand)
  const stuur = async () => {
    if (!onToevoegen) return setMelding({ ok: false, tekst: 'Dit werkt alleen als de klant zelf is ingelogd.' })
    setBezig(true); setMelding(null)
    const fout = await onToevoegen(soort === 'link' ? { soort, titel, url } : soort === 'datum' ? { soort, titel, datum } : { soort, titel, bestand: bestand! })
    setBezig(false)
    if (fout) return setMelding({ ok: false, tekst: fout })
    setTitel(''); setUrl(''); setDatum(''); setBestand(null)
    setMelding({ ok: true, tekst: 'Dank je! Het staat bij ons op de lijst.' })
  }
  return (
    <section className="portal-card sv-aanleveren">
      <Icon name="upload" size={22} />
      <h3>Iets aanleveren</h3>
      <p className="muted">Een bestand, een link of een belangrijke datum. Het komt direct bij ons binnen.</p>
      <div className="sv-seg" role="tablist">
        {(['link', 'bestand', 'datum'] as const).map((x) => <button key={x} className={soort === x ? 'on' : ''} onClick={() => { setSoort(x); setMelding(null) }}>{x === 'link' ? 'Link' : x === 'bestand' ? 'Bestand' : 'Datum'}</button>)}
      </div>
      <div className="sv-velden">
        <input placeholder={soort === 'datum' ? 'Bijv. deadline campagne, beurs, livegang' : 'Omschrijving (optioneel)'} value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={120} />
        {soort === 'link' && <input type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />}
        {soort === 'datum' && <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />}
        {soort === 'bestand' && <label className="sv-bestand"><input type="file" onChange={(e) => setBestand(e.target.files?.[0] ?? null)} /><span>{bestand ? bestand.name : 'Kies een bestand (max. 50 MB)'}</span></label>}
        <button className="btn primary small" disabled={!klaar || bezig} onClick={stuur}>{bezig ? 'Versturen…' : 'Versturen'}</button>
      </div>
      {melding && <p className="small" style={{ color: melding.ok ? 'var(--green, #30A46C)' : '#c0392b', margin: '8px 0 0' }}>{melding.tekst}</p>}
      {eigen.length > 0 && (
        <>
          <p className="sv-eigen-kop" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>Wat je hebt aangeleverd</p>
          <ul className="sv-eigen">{eigen.map((x) => <li key={x.id}><button className="sv-eigen-knop" onClick={() => openen(x)}><Icon name="check" size={13} /><span>{x.naam}</span><span className="muted small">{kort(x.at.slice(0, 10))}</span><Icon name="arrow" size={13} /></button></li>)}</ul>
          {alleEigen.length > 5 && <button className="link small" onClick={() => setAlles(!alles)}>{alles ? 'Minder tonen' : `Alles tonen (${alleEigen.length})`}</button>}
        </>
      )}
    </section>
  )
}

function Service(p: P) {
  const { client } = p
  const g = gegevens(client)
  const producties = client.producties ?? []
  const lopend = producties.filter((x) => x.fase !== 'live')
  const klaar = producties.filter((x) => x.fase === 'live')
  const volgende = g.komend.find((m) => m.soort !== 'taak')
  const heeftKalender = (client.kanalen ?? []).length > 0
  const [tab, setTab] = useState<'overzicht' | 'content' | 'geld' | 'strippenkaart'>('overzicht')
  const geenProject = lopend.length === 0
  const status = g.open.length
    ? `Wij regelen de rest. Er ${g.open.length === 1 ? 'staat één ding' : `staan ${g.open.length} dingen`} voor je klaar, verder hoef je niets te doen.`
    : geenProject
      ? 'Op dit moment loopt er geen project. Zodra we samen iets nieuws starten, zie je hier precies waar we staan.'
      : 'Je hoeft niets te doen. Wij zijn aan de slag en houden je hier op de hoogte.'
  return (
    <div className="portal pl sv">
      <header className="portal-head">
        <img src="/img/logo-navy.png" alt="Rise Video Marketing" />
        <span className="muted small">{client.name}{p.actions}</span>
      </header>

      <div className="pl-tabs pi-tabs sv-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'overzicht'} className={tab === 'overzicht' ? 'on' : ''} onClick={() => setTab('overzicht')}>Overzicht</button>
        <button role="tab" aria-selected={tab === 'content'} className={tab === 'content' ? 'on' : ''} onClick={() => setTab('content')}>Content & Deliverables</button>
        {p.facturen && <button role="tab" aria-selected={tab === 'geld'} className={tab === 'geld' ? 'on' : ''} onClick={() => setTab('geld')}>Offertes & Facturen</button>}
        <button role="tab" aria-selected={tab === 'strippenkaart'} className={tab === 'strippenkaart' ? 'on' : ''} onClick={() => setTab('strippenkaart')}>Strippenkaart{client.strippenkaart ? ` · ${String(stripTelling(client.strippenkaart).over).replace('.', ',')} over` : ''}</button>
      </div>

      {tab === 'content' ? <>
        <section className="portal-card dark sv-opgeleverd sv-frame-groot">
          <Icon name="play" size={22} />
          <h3>Content & Deliverables</h3>
          <p>Al je video's en bestanden. Bekijken, downloaden en reageren kan direct hier, zonder account.</p>
          {client.frameUrl ? <FrameEmbed url={client.frameUrl} donker /> : <span className="small portal-content-leeg">Hier verschijnen je video's zodra de eerste versie klaarstaat.</span>}
          {client.frameUrl && <a className="btn light small" href={client.frameUrl} target="_blank" rel="noreferrer">Openen op volledig scherm <Icon name="external" size={13} /></a>}
        </section>
        {heeftKalender && <section className="portal-card"><Icon name="calendar" size={22} /><h3>Contentkalender</h3><p className="muted">Wat we wanneer voor je plaatsen. Klik op een item voor de volledige tekst.</p><ContentKalender client={client} klant /></section>}
        <section className="portal-card"><Icon name="note" size={22} /><h3>Bestanden & links</h3><Bestanden g={g} /></section>
      </> : tab === 'geld' ? <><OffertesKaart clientId={client.id} /><FacturenKaart clientId={client.id} /><HulpvraagKaart vragen={client.hulpvragen ?? []} onVraag={p.onVraag} /></> : tab === 'strippenkaart' ? <><StrippenkaartKlant client={client} /><HulpvraagKaart vragen={client.hulpvragen ?? []} onVraag={p.onVraag} /></> : <>
      <section className="sv-hero">
        <div className="sv-hero-tekst">
          <span className="sv-kicker">Status{g.pakket ? ` · ${g.pakket}` : ''}</span>
          {geenProject ? <h2>Geen lopende projecten</h2> : (
            <ul className="sv-videos">
              {lopend.map((x) => <VideoStatus key={x.id} x={x} vandaag={g.vandaag} />)}
            </ul>
          )}
          <p>{status}</p>
          {client.onboardingVideoUrl && <a className="btn light small" href={client.onboardingVideoUrl} target="_blank" rel="noreferrer">Welkomstvideo <Icon name="external" size={13} /></a>}
        </div>
        <div className="sv-hero-cijfers">
          {geenProject
            ? <div><span>Lopend</span><strong>0</strong><em>projecten</em></div>
            : <div><span>Voortgang</span><strong>{g.procent}%</strong><Balkje procent={g.procent} licht /></div>}
          <div><span>Volgende</span><strong>{volgende ? kort(volgende.datum) : '—'}</strong><em>{volgende?.titel ?? 'nog niets gepland'}</em></div>
          <div><span>Opgeleverd</span><strong>{klaar.length}</strong><em>{klaar.length === 1 ? 'productie' : 'producties'}</em></div>
        </div>
      </section>

      {g.open.length > 0 && (
        <section className="portal-card sv-voorjou">
          <Icon name="check" size={20} />
          <h3>Eén ding van jou</h3>
          <div className="pl-actielijst">{g.open.map((t) => <ActieRij key={t.id} t={t} onTaak={p.onTaak} />)}</div>
        </section>
      )}

      {!geenProject && <ol className="portal-steps sv-steps">
        {g.traject.map((f, i) => (
          <li key={f.key} className={i < g.huidig ? 'done' : i === g.huidig ? 'current' : ''}>
            <span className="dot">{i < g.huidig ? <Icon name="check" size={12} /> : ''}</span>
            <span>{f.klantLabel}</span>
          </li>
        ))}
      </ol>}

      <div className="portal-grid portal-grid-2 sv-rij">
        <section className="portal-card">
          <Icon name="calendar" size={22} />
          <h3>Planning</h3>
          <Momenten lijst={g.komend.filter((m) => m.soort !== 'content')} leeg="Hier zetten we je draaidag, opleveringen en andere vaste momenten zodra ze vaststaan." max={6} />
        </section>
        <KlantToevoegen client={client} onToevoegen={p.onToevoegen} />
      </div>

        <section className="portal-card dark sv-opgeleverd sv-breed">
          <Icon name="play" size={22} />
          <h3>Je video's</h3>
          <p>Bekijken, downloaden en reageren. Alles staat klaar in Frame.io, je hebt geen account nodig.</p>
          {client.frameUrl ? <FrameEmbed url={client.frameUrl} donker /> : <span className="small portal-content-leeg">Hier verschijnen je video's zodra de eerste versie klaarstaat.</span>}
          {client.frameUrl && <button className="btn light small" onClick={() => setTab('content')}>Alles bekijken in Content & Deliverables</button>}
          {klaar.length > 0 && <ul className="sv-klaar">{klaar.map((x) => <li key={x.id}><Icon name="check" size={13} />{x.name}</li>)}</ul>}
        </section>


      {heeftKalender && <section className="portal-card"><Icon name="calendar" size={22} /><h3>Contentkalender</h3><p className="muted">Wat we wanneer voor je plaatsen. Klik op een item voor de volledige tekst.</p><ContentKalender client={client} klant /></section>}

      {client.metaAdAccount && <WeekResultaten client={client} />}

      <HulpvraagKaart vragen={client.hulpvragen ?? []} onVraag={p.onVraag} />

      {g.kennis.length > 0 && <section className="portal-card"><Icon name="book" size={22} /><h3>Handig om te weten</h3><Kennis g={g} /></section>}
      </>}
    </div>
  )
}

export const INDELINGEN: { naam: string; Comp?: ComponentType<P> }[] = [
  { naam: 'Oorspronkelijk' },
  { naam: '1 · Cockpit', Comp: Cockpit },
  { naam: '2 · Tabbladen', Comp: Tabbladen },
  { naam: '3 · Bento', Comp: Bento },
  { naam: '4 · Tijdlijn', Comp: Tijdlijn },
  { naam: '5 · Verhaal', Comp: Verhaal },
  { naam: '6 · Jij · Rise · Klaar', Comp: JijRiseKlaar },
  { naam: '7 · Service (standaard)', Comp: Service },
]

/** Indeling als er voor een klant niets gekozen is: Service. */
export const STANDAARD_INDELING = INDELINGEN.length - 1
