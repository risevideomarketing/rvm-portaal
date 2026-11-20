import { useEffect, useState, type ReactNode } from 'react'
import { Progress } from '../components/charts'
import { WeekResultaten } from '../components/Weekcijfers'
import { Icon, PageHead, Segmented, SkeletRegels } from '../components/ui'
import { faseVan, fasenVan } from '../data/mock'
import { artikelenNu, useArtikelen } from '../kennis'
import type { Client, ContentPlek, Hulpvraag, KlantTaak } from '../data/types'
import { mag, useStore } from '../store'
import { commissieOphalen, klantFacturen, type Commissie, type KlantFactuur } from '../slack'
import { CommissieBerekening } from '../components/Commissie'
import { INDELINGEN, STANDAARD_INDELING } from './PortaalIndelingen'
import { ContentKalender } from '../components/ContentKalender'
import { FrameEmbed } from '../components/FrameEmbed'
import { bronVan, fmtDate, pakketNaam } from '../utils'

/** Standaard onboarding-stappen zoals de klant ze leest. Eigen stappen ziet de klant letterlijk. */
export const ONBOARDING_KLANT: Record<string, string> = {
  'Kick-off gehad': 'Kennismaking en kick-off',
  'Intake gehad (doel, doelgroep, deadline, budget, kanalen)': 'Kennismaking en intake',
  'Go/no-go: past het bij ons': 'We weten wat je nodig hebt',
  'Portaal-login aangemaakt': 'Inloggen op dit portaal',
}

/** Pakketnaam zonder bedragen: prijzen horen niet in het portaal. */

/** Team: voorbeeld van het portaal per klant, met keuzelijst. */
export function Portaal({ id, go }: { id?: string; go: (r: string) => void }) {
  const { s } = useStore()
  const client = s.clients.find((c) => c.id === id) ?? s.clients[0]
  if (!client) return <PageHead title="Klantportaal" sub="Nog geen klanten. Maak eerst een klantdossier aan vanuit de CRM." />
  return (
    <>
      <PageHead title="Klantportaal" sub="Zo ziet de klant zijn omgeving op app.risevideomarketing.nl. Alleen eigen voortgang, planning, content en bestanden, nooit taken, CRM of bedragen.">
        <select value={client.id} onChange={(e) => go(`portaal/${e.target.value}`)}>
          {s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn primary" onClick={() => go(`portaal/${client.id}/als-klant`)}><Icon name="portal" size={16} /> Bekijk als klant</button>
      </PageHead>
      <div className="browser">
        <div className="browser-bar">
          <span className="dots"><i /><i /><i /></span>
          <span className="url"><Icon name="lock" size={12} /> app.risevideomarketing.nl</span>
        </div>
        <PortaalView client={client} facturen={mag(s, 'geld')} />
      </div>
    </>
  )
}

const euroNL = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

/** Facturen uit Moneybird: nummer, datum, bedrag, status, met een link om te bekijken, downloaden en betalen. */
export function FacturenKaart({ clientId }: { clientId: string }) {
  const [staat, setStaat] = useState<{ laden: true } | { facturen: KlantFactuur[] } | { lokaal: true } | { fout: string }>({ laden: true })
  useEffect(() => {
    let weg = false
    klantFacturen(clientId).then((r) => {
      if (weg) return
      if (r === null) setStaat({ lokaal: true })
      else if ('fout' in r) setStaat({ fout: r.fout })
      else setStaat({ facturen: r.facturen })
    })
    return () => { weg = true }
  }, [clientId])
  return (
    <section className="portal-card portal-facturen">
      <Icon name="note" size={22} />
      <h3>Facturen</h3>
      {'laden' in staat && <div style={{ width: '100%' }}><SkeletRegels n={3} /></div>}
      {'lokaal' in staat && <p className="muted">Hier staan je facturen, met een link om ze te bekijken, te downloaden en te betalen. (Lokaal niet zichtbaar, live wel.)</p>}
      {'fout' in staat && <p className="muted">De facturen zijn nu niet op te halen. Probeer het later nog eens.</p>}
      {'facturen' in staat && (staat.facturen.length === 0 ? (
        <p className="muted">Nog geen facturen.</p>
      ) : (
        <ul className="portal-facturen-lijst">
          {staat.facturen.map((f) => (
            <li key={f.nummer}>
              <span className="factuur-nr"><strong>{f.nummer}</strong><span className="muted small">{f.datum ? fmtDate(f.datum) : ''}{f.status !== 'betaald' && f.vervaldatum ? ` · vervalt ${fmtDate(f.vervaldatum)}` : ''}</span></span>
              <span className="factuur-bedrag">{euroNL(f.bedrag)}</span>
              <span className={`badge ${f.status === 'betaald' ? 'status-klaar' : f.status === 'te laat' ? 'prio-hoog' : 'status-bezig'}`}>{f.status === 'betaald' ? 'Betaald' : f.status === 'te laat' ? 'Te laat' : 'Open'}</span>
              {f.url ? <a className="btn small" href={f.url} target="_blank" rel="noreferrer">{f.status === 'betaald' ? 'Bekijken' : 'Bekijken en betalen'}</a> : <span />}
            </li>
          ))}
        </ul>
      ))}
    </section>
  )
}

/** Meta-commissie: de berekening van vorige en deze maand, zodat de klant precies ziet waar het bedrag vandaan komt. */
export function CommissieKaart({ clientId }: { clientId: string }) {
  const maand = (o: number) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() + o); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` }
  const [keuze, setKeuze] = useState(maand(-1))
  const [c, setC] = useState<Commissie | { fout: string } | null>(null)
  useEffect(() => {
    let weg = false
    setC(null)
    commissieOphalen(clientId, keuze).then((r) => { if (!weg) setC(r) })
    return () => { weg = true }
  }, [clientId, keuze])
  return (
    <section className="portal-card portal-commissie">
      <Icon name="chart" size={22} />
      <h3>Zo rekenen we de commissie</h3>
      <Segmented value={keuze} onChange={setKeuze} options={[{ value: maand(-1), label: 'Vorige maand' }, { value: maand(0), label: 'Deze maand' }]} />
      {!c && <div style={{ width: '100%' }}><SkeletRegels n={4} /></div>}
      {c && 'fout' in c && <p className="muted">De berekening is nu niet op te halen. Probeer het later nog eens.</p>}
      {c && !('fout' in c) && <CommissieBerekening c={c} />}
      <p className="muted small">De aankopen komen rechtstreeks uit je Meta-advertentieaccount. Het bedrag komt op de factuur van de maand erna.</p>
    </section>
  )
}

/** Hulpvraag stellen: komt bij het team binnen in Slack. */
export function HulpvraagKaart({ vragen, onVraag }: { vragen: Hulpvraag[]; onVraag?: (tekst: string) => Promise<string | void> }) {
  const [tekst, setTekst] = useState('')
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null)
  const stuur = async () => {
    if (tekst.trim().length < 3) return
    if (!onVraag) return setMelding({ ok: false, tekst: 'Versturen werkt alleen als de klant zelf is ingelogd.' })
    setBezig(true); setMelding(null)
    const fout = await onVraag(tekst.trim())
    setBezig(false)
    if (fout) return setMelding({ ok: false, tekst: fout })
    setTekst('')
    setMelding({ ok: true, tekst: 'Je vraag is binnen. We nemen zo snel mogelijk contact met je op.' })
  }
  const recent = vragen.slice(0, 5)
  return (
    <section className="portal-card portal-vraag">
      <Icon name="chat" size={22} />
      <h3>Vraag of hulp nodig?</h3>
      <p className="muted">Stel je vraag hier. Hij komt direct bij ons team binnen.</p>
      <textarea rows={3} placeholder="Waar kunnen we je mee helpen?" value={tekst} maxLength={2000} onChange={(e) => setTekst(e.target.value)} />
      <div className="portal-vraag-acties">
        <button className="btn primary small" disabled={bezig || tekst.trim().length < 3} onClick={stuur}>{bezig ? 'Versturen…' : 'Versturen'}</button>
        {melding && <span className="small" style={{ color: melding.ok ? 'var(--green, #30A46C)' : '#c0392b' }}>{melding.tekst}</span>}
      </div>
      {recent.length > 0 && (
        <ul className="portal-vragen">
          {recent.map((v) => (
            <li key={v.id}>
              <span className={`badge ${v.afgehandeld ? 'status-klaar' : 'status-bezig'}`}>{v.afgehandeld ? 'Afgehandeld' : 'Open'}</span>
              <span className="small">{v.tekst.length > 120 ? `${v.tekst.slice(0, 120)}…` : v.tekst}</span>
              <span className="muted small">{fmtDate(v.at.slice(0, 10))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Je content: Frame.io plus de contentplekken (Drive, SharePoint…). De klant kan zelf een link toevoegen. */
export function ContentKaart({ client, onContent }: { client: Client; onContent?: (body: { actie: 'toevoegen'; titel: string; url: string } | { actie: 'weg'; id: string }) => Promise<string | void> }) {
  const plekken = client.contentPlekken ?? []
  const [open, setOpen] = useState(false)
  const [titel, setTitel] = useState('')
  const [url, setUrl] = useState('')
  const [beheren, setBeheren] = useState(false)
  const [wegId, setWegId] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const doe = async (body: Parameters<NonNullable<typeof onContent>>[0]) => {
    if (!onContent) return setFout('Dit werkt alleen als de klant zelf is ingelogd.')
    setBezig(true); setFout('')
    const r = await onContent(body)
    setBezig(false)
    if (r) return setFout(r)
    setTitel(''); setUrl(''); setOpen(false); setWegId(null)
  }
  const eigen = plekken.filter((p) => p.door === 'klant')
  return (
    <div className="portal-card dark portal-content">
      <Icon name="play" size={22} />
      <h3>Je content</h3>
      <p>Alles op één plek: wat wij maken en wat jij aanlevert. Zet je eigen map erbij, dan kunnen wij erbij.</p>
      <div className="portal-content-lijst">
        {client.frameUrl && <FrameEmbed url={client.frameUrl} donker />}
        {plekken.map((p: ContentPlek) => (
          <div key={p.id} className="portal-content-rij">
            <a className="portal-content-link" href={p.url} target="_blank" rel="noreferrer"><span><strong>{p.title}</strong><span className="small">{[bronVan(p.url) !== p.title && bronVan(p.url), p.door === 'klant' && 'door jou toegevoegd'].filter(Boolean).join(' · ') || 'Map met content'}</span></span><Icon name="external" size={14} /></a>
            {beheren && p.door === 'klant' && wegId !== p.id && <button className="link small light" onClick={() => setWegId(p.id)}>Weghalen…</button>}
            {wegId === p.id && (
              <span className="weg-bevestig light">
                <span className="small">Zeker weten? Ook wij zien hem dan niet meer.</span>
                <button className="btn small light" disabled={bezig} onClick={() => doe({ actie: 'weg', id: p.id })}>Ja, weghalen</button>
                <button className="link small light" onClick={() => setWegId(null)}>Nee</button>
              </span>
            )}
          </div>
        ))}
        {!client.frameUrl && !plekken.length && <span className="small portal-content-leeg">Hier komen de mappen met je content zodra ze er zijn.</span>}
      </div>
      {open ? (
        <div className="portal-content-form">
          <input placeholder="Naam (bijv. Foto's voor de website)" value={titel} onChange={(e) => setTitel(e.target.value)} />
          <input placeholder="Link naar je map (Drive, SharePoint, Dropbox…)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && url.trim() && doe({ actie: 'toevoegen', titel, url })} />
          <div><button className="btn light small" disabled={!url.trim() || bezig} onClick={() => doe({ actie: 'toevoegen', titel, url })}>Toevoegen</button> <button className="link small light" onClick={() => setOpen(false)}>Annuleren</button></div>
        </div>
      ) : (
        <div className="portal-content-acties">
          <button className="btn light small" onClick={() => setOpen(true)}>+ Eigen map toevoegen</button>
          {eigen.length > 0 && <button className="link small light" onClick={() => { setBeheren(!beheren); setWegId(null) }}>{beheren ? 'Klaar' : 'Beheren'}</button>}
        </div>
      )}
      {fout && <p className="small" style={{ color: '#ffb4a8', margin: '8px 0 0' }}>{fout}</p>}
    </div>
  )
}

/** Wat de klant zelf moet doen. Afvinken werkt alleen bij de ingelogde klant (in de teamweergave doet de knop niets). */
export function KlantTakenPortaal({ taken, onTaak }: { taken: KlantTaak[]; onTaak?: (id: string, gedaan: boolean) => Promise<string | void> }) {
  const [bezig, setBezig] = useState<string | null>(null)
  const [fout, setFout] = useState('')
  if (!taken.length) return null
  const open = taken.filter((t) => !t.done).sort((a, b) => (a.deadline ?? '9').localeCompare(b.deadline ?? '9'))
  const klaar = taken.filter((t) => t.done)
  const klik = async (t: KlantTaak) => {
    if (!onTaak) return
    setBezig(t.id); setFout('')
    const r = await onTaak(t.id, !t.done)
    if (r) setFout(r)
    setBezig(null)
  }
  return (
    <section className="portal-card portal-taken">
      <Icon name="check" size={22} />
      <h3>{open.length ? 'Wat we van je nodig hebben' : 'Alles is binnen, dank je!'}</h3>
      {open.length > 0 && <p className="muted">Zodra je iets hebt gedaan, vink je het hier af. Dan weten wij dat we verder kunnen.</p>}
      <ul className="portal-taken-lijst">
        {open.map((t) => (
          <li key={t.id}>
            <button className="portal-vink" disabled={bezig === t.id} onClick={() => klik(t)} aria-label={`${t.title} afvinken`} title={onTaak ? 'Afvinken' : 'Alleen de klant kan afvinken'} />
            <span><strong>{t.title}</strong>{t.description && <span className="muted small"> {t.description}</span>}</span>
            {t.deadline && <span className="muted small portal-taak-datum">graag vóór {fmtDate(t.deadline)}</span>}
          </li>
        ))}
        {klaar.map((t) => (
          <li key={t.id} className="klaar">
            <button className="portal-vink aan" disabled={bezig === t.id} onClick={() => klik(t)} aria-label={`${t.title} weer openzetten`}><Icon name="check" size={12} /></button>
            <span>{t.title}</span>
          </li>
        ))}
      </ul>
      {fout && <p className="small" style={{ color: 'var(--red, #c0392b)' }}>{fout}</p>}
    </section>
  )
}

/** Uitlogknop zoals de klant hem ziet; in de teamweergave doet hij niets. */
const NEP_UITLOG = <span className="link small portal-logout" title="Alleen bij de klant actief">Uitloggen</span>

/**
 * Het portaal op volledig scherm, exact zoals de ingelogde klant het ziet (zelfde component, zelfde gegevens).
 * kaal: zonder teambalk, voor de telefoonweergave in een iframe (dan gelden de mobiele stijlen echt).
 */
export function AlsKlant({ id, kaal, go }: { id?: string; kaal?: boolean; go: (r: string) => void }) {
  const { s, d } = useStore()
  const [toestel, setToestel] = useState<'computer' | 'telefoon'>('computer')
  const client = s.clients.find((c) => c.id === id) ?? s.clients[0]
  if (!client) return <div className="portal-standalone"><p className="muted" style={{ padding: 40 }}>Nog geen klanten.</p></div>
  const portaal = <div className="portal-standalone"><PortaalView client={client} actions={NEP_UITLOG} facturen={mag(s, 'geld')} /></div>
  if (kaal) return portaal
  return (
    <div className="als-klant">
      <div className="als-klant-bar">
        <button className="link" onClick={() => go(`klanten/${client.id}`)}>← Dashboard</button>
        <span className="als-klant-label"><Icon name="portal" size={15} /> Je ziet het portaal van</span>
        <select value={client.id} onChange={(e) => go(`portaal/${e.target.value}/als-klant`)}>
          {s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="als-klant-indeling small">Indeling
          <select value={client.portaalIndeling ?? STANDAARD_INDELING} onChange={(e) => d({ type: 'client:upsert', client: { ...client, portaalIndeling: Number(e.target.value) } })}>
            {INDELINGEN.map((x, i) => <option key={i} value={i}>{x.naam}</option>)}
          </select>
        </label>
        <Segmented value={toestel} onChange={setToestel} options={[{ value: 'computer', label: 'Computer' }, { value: 'telefoon', label: 'Telefoon' }]} />
      </div>
      {toestel === 'computer' ? portaal : (
        <div className="als-klant-telefoon">
          <iframe title={`Portaal ${client.name} op telefoon`} src={`${window.location.pathname}#/portaal/${client.id}/kaal`} />
        </div>
      )}
    </div>
  )
}

export interface PortaalProps {
  client: Client
  actions?: ReactNode
  onTaak?: (id: string, gedaan: boolean) => Promise<string | void>
  onContent?: (body: { actie: 'toevoegen'; titel: string; url: string } | { actie: 'weg'; id: string }) => Promise<string | void>
  onVraag?: (tekst: string) => Promise<string | void>
  /** Facturen tonen (klant altijd; team alleen met het recht geld). */
  facturen?: boolean
}

/** Het portaal zelf: wat een ingelogde klant ziet, in de indeling die voor deze klant gekozen is (0 = de oorspronkelijke). */
export function PortaalView(props: PortaalProps) {
  useArtikelen()
  // Standaard de Cockpit; 0 = de oorspronkelijke indeling (kies je bewust bij Bekijk als klant)
  const n = props.client.portaalIndeling ?? STANDAARD_INDELING
  const Indeling = INDELINGEN[n]?.Comp
  return Indeling ? <Indeling {...props} facturen={props.facturen ?? true} /> : <PortaalHuidig {...props} />
}

/** De oorspronkelijke indeling (alle blokken onder elkaar). */
function PortaalHuidig({ client, actions, onTaak, onContent, onVraag, facturen = true }: PortaalProps) {
  const onboarding = client.phase === 0
  const fasen = fasenVan(client)
  const traject = fasen.slice(1)
  const huidig = Math.min(client.phase, fasen.length - 1) - 1 // index binnen het traject; -1 tijdens de onboarding
  const vandaag = new Date().toISOString().slice(0, 10)
  const eigen = client.planning ?? []
  const planning = [
    ...eigen,
    ...(client.nextShoot && !eigen.some((p) => p.date === client.nextShoot) ? [{ id: 'shoot', date: client.nextShoot, title: 'Shootdag' }] : []),
  ]
    .filter((p) => p.date >= vandaag)
    .sort((a, b) => a.date.localeCompare(b.date))
  const links = (client.links ?? []).filter((l) => l.klant)
  const kennis = artikelenNu().filter((a) => a.klant)

  return (
    <div className="portal">
      <header className="portal-head">
        <img src="/img/logo-navy.png" alt="Rise Video Marketing" />
        <span className="muted small">{client.name}{actions}</span>
      </header>

      {onboarding && (
        <section className="portal-welcome portal-onboarding">
          <Icon name="check" size={22} />
          <div>
            <h3>Welkom bij Rise Video Marketing</h3>
            <p>Eerst regelen we samen de onboarding. Daarna zie je hier je traject, de planning en al je content.</p>
            <ul className="checklist" style={{ marginTop: 10 }}>
              {fasen[0].steps.map((st) => (
                <li key={st} className={client.doneSteps.includes(st) ? 'done' : ''}>
                  {client.doneSteps.includes(st) ? '✓' : '○'} {ONBOARDING_KLANT[st] ?? st}
                </li>
              ))}
            </ul>
          </div>
          {client.onboardingVideoUrl && (
            <a className="btn light" href={client.onboardingVideoUrl} target="_blank" rel="noreferrer">Welkomstvideo <Icon name="external" size={14} /></a>
          )}
        </section>
      )}

      <KlantTakenPortaal taken={client.klantTaken ?? []} onTaak={onTaak} />

      {(client.kanalen ?? []).length > 0 && (
        <section className="portal-card portal-content-kalender">
          <Icon name="calendar" size={22} />
          <h3>Contentkalender</h3>
          <p className="muted">Wat we wanneer versturen en plaatsen. Klik op een {(client.kanalen ?? []).every((k) => /mail/i.test(k)) ? 'mail' : 'item'} om de volledige tekst te lezen.</p>
          <ContentKalender client={client} klant />
        </section>
      )}

      <section className="portal-hero">
        <div className="portal-kicker">Jouw traject{client.pakket ? ` · ${pakketNaam(client.pakket)}` : ''}</div>
        <h2>{onboarding ? 'We zetten alles klaar' : faseVan(client).klantLabel}</h2>
        <div className="portal-progress"><Progress value={Math.max(0, huidig + 1)} max={traject.length} /></div>
        <ol className="portal-steps">
          {traject.map((p, i) => (
            <li key={p.key} className={i < huidig ? 'done' : i === huidig ? 'current' : ''}>
              <span className="dot">{i < huidig ? <Icon name="check" size={12} /> : ''}</span>
              <span>{p.klantLabel}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="portal-grid portal-grid-2" style={{ marginTop: 0 }}>
        <ContentKaart client={client} onContent={onContent} />
        <div className="portal-card">
          <Icon name="calendar" size={22} />
          <h3>Planning</h3>
          {planning.length === 0 ? (
            <p className="muted">We zetten hier de shootdag, de livegang en andere vaste momenten zodra ze vaststaan.</p>
          ) : (
            <ul className="plan-list" style={{ width: '100%' }}>
              {planning.slice(0, 5).map((p) => (
                <li key={p.id}><span className="plan-date">{fmtDate(p.date)}</span><span>{p.title}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="portal-grid portal-grid-2">
        <div className="portal-card">
          <Icon name="note" size={22} />
          <h3>Bestanden & links</h3>
          {links.length === 0 ? (
            <p className="muted">Hier staan straks je brand guidelines, Drive-mappen en andere documenten, zodat niets in losse mails verdwijnt.</p>
          ) : (
            <div style={{ width: '100%' }}>
              {links.map((l) => (
                <div key={l.id} className="link-row"><Icon name="external" size={14} /><a href={l.url} target="_blank" rel="noreferrer">{l.title}</a></div>
              ))}
            </div>
          )}
        </div>
        <div className="portal-card portal-kb">
          <Icon name="book" size={22} />
          <h3>Kennisbank</h3>
          <div style={{ width: '100%' }}>
            {kennis.map((a) => (
              <details key={a.id}>
                <summary>{a.title} <span className="muted small">· {a.summary}</span></summary>
                {a.steps && <ol>{a.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>}
                {a.body.map((p, i) => <p key={i} className="small">{p}</p>)}
                {a.videoUrl && <a className="link small" href={a.videoUrl} target="_blank" rel="noreferrer">Bekijk de uitlegvideo</a>}
              </details>
            ))}
          </div>
        </div>
      </div>

      {facturen && <FacturenKaart clientId={client.id} />}
      {facturen && client.commissiePct && client.metaAdAccount && <CommissieKaart clientId={client.id} />}

      <HulpvraagKaart vragen={client.hulpvragen ?? []} onVraag={onVraag} />

      <WeekResultaten client={client} />
    </div>
  )
}
