import { useEffect, useState, type ReactNode } from 'react'
import { MerkLogo } from '../components/Logo'
import { Icon, PageHead, Segmented, SkeletRegels } from '../components/ui'
import { geld, getal, resultaat } from '../components/Weekcijfers'
import { STAGES, faseVan, isKlant } from '../data/mock'
import type { Client } from '../data/types'
import {
  analytics, eigenMeta, klantMetaLive, moneybird,
  type AnalyticsCijfers, type EigenPeriode, type MetaGetallen, type MoneybirdCijfers,
} from '../slack'
import { useStore } from '../store'
import { euro, fmtDateTime } from '../utils'

type Laden<T> = T | undefined | { fout: string }
const isFout = (x: unknown): x is { fout: string } => typeof x === 'object' && x !== null && 'fout' in x

/** Kader voor één widget. */
function Widget({ titel, icon, rechts, children, breed, kleur }: { titel: string; icon: string; rechts?: ReactNode; children: ReactNode; breed?: boolean; kleur?: 'moneybird' | 'crm' | 'analytics' | 'meta' }) {
  return (
    <section className={`card widget ${breed ? 'breed' : ''} ${kleur ? `rand-${kleur}` : ''}`}>
      <div className="card-head">
        <h3><Icon name={icon} size={18} /> {titel}</h3>
        {rechts}
      </div>
      {children}
    </section>
  )
}

function Tegel({ label, waarde, onder, toon }: { label: string; waarde: string; onder?: ReactNode; toon?: 'goed' | 'minder' }) {
  return (
    <div className="result-tile">
      <span>{label}</span>
      <strong className={toon ? `toon-${toon}` : ''}>{waarde}</strong>
      {onder && <span className="muted small">{onder}</span>}
    </div>
  )
}

const pct = (nu: number, ervoor: number) => (ervoor ? Math.round(((nu - ervoor) / ervoor) * 100) : null)
const Delta = ({ nu, ervoor, lagerIsBeter }: { nu: number; ervoor: number; lagerIsBeter?: boolean }) => {
  const p = pct(nu, ervoor)
  if (p == null || p === 0) return null
  const goed = lagerIsBeter ? p < 0 : p > 0
  return <span className={`verschil ${goed ? 'goed' : 'minder'}`}>{p > 0 ? '▲' : '▼'} {Math.abs(p)}%</span>
}

/** Wat we laten zien als de koppeling er (nog) niet is. */
function NogNiet({ live, data, wat }: { live: boolean; data: unknown; wat: string }) {
  if (!live) return <p className="muted small">Lokaal geen live koppelingen. Na de livegang staan hier de cijfers uit {wat}.</p>
  if (data === undefined) return <SkeletRegels n={2} />
  if (isFout(data)) return <p className="muted small">Niet op te halen: {data.fout}</p>
  return null
}

export function Statistieken({ go }: { go: (r: string) => void }) {
  const { s } = useStore()
  return (
    <>
      <PageHead title="Statistieken" sub={<><Icon name="lock" size={14} /> Alleen zichtbaar voor Rise-admins</>} />
      <div className="widget-grid">
        <MoneybirdWidget live={s.live} />
        <CrmWidget />
        <AnalyticsWidget live={s.live} />
        <EigenMetaWidget live={s.live} />
      </div>
      <KlantenWidget live={s.live} go={go} />
    </>
  )
}

function MoneybirdWidget({ live }: { live: boolean }) {
  const [periode, setPeriode] = useState<'maand' | 'jaar'>('maand')
  const [mb, setMb] = useState<Laden<MoneybirdCijfers>>(undefined)
  useEffect(() => {
    if (!live) return
    setMb(undefined)
    moneybird(periode).then(setMb)
  }, [live, periode])
  const ok = mb && !isFout(mb) && mb.gekoppeld ? mb : null
  const w = (n?: number) => (ok && n != null ? euro(n) : '—')
  return (
    <Widget kleur="moneybird" titel="Moneybird" icon="note" rechts={<Segmented value={periode} onChange={setPeriode} options={[{ value: 'maand', label: 'Deze maand' }, { value: 'jaar', label: 'Dit jaar' }]} />}>
      <div className="results-grid">
        <Tegel label="Omzet" waarde={w(ok?.omzet)} onder="excl. btw" />
        <Tegel label="Kosten" waarde={w(ok?.kosten)} onder="inkoop en bonnen" />
        <Tegel label="Winst" waarde={w(ok?.winst)} toon={ok?.winst != null ? (ok.winst >= 0 ? 'goed' : 'minder') : undefined} />
        <Tegel label="Betalingen ontvangen" waarde={w(ok?.betalingen?.bedrag)} onder={ok?.betalingen ? `${ok.betalingen.aantal} facturen` : undefined} />
      </div>
      <div className="upcoming">
        <div className="upcoming-kop"><strong>Upcoming</strong><span className="bubbel" title="Conceptfacturen">{ok?.concept?.aantal ?? '—'}</span><span className="muted small">conceptfacturen</span></div>
        <div className="upcoming-bedrag">{ok ? euro(ok.concept?.exBtw ?? ok.concept?.bedrag ?? 0) : '—'} <span className="muted small">conceptomzet {ok?.concept?.exBtw != null ? 'excl. btw' : 'incl. btw'}</span></div>
      </div>
      {ok && (
        <p className="muted small widget-voet">
          {ok.open?.aantal ?? 0} openstaand ({euro(ok.open?.bedrag ?? 0)}{ok.open?.teLaat ? `, ${ok.open.teLaat} te laat` : ''}) · bijgewerkt {fmtDateTime(ok.bijgewerkt!)}
        </p>
      )}
      {mb && !isFout(mb) && !mb.gekoppeld && <p className="muted small">Nog niet gekoppeld: zet MONEYBIRD_TOKEN en MONEYBIRD_ADMINISTRATION_ID in Netlify.</p>}
      <NogNiet live={live} data={mb} wat="Moneybird" />
    </Widget>
  )
}

function CrmWidget() {
  const { s } = useStore()
  const sinds = Date.now() - 30 * 86400000
  const contactmomenten = s.contacts.flatMap((c) => c.timeline).filter((t) => ['mail-uit', 'whatsapp', 'gesprek'].includes(t.kind) && new Date(t.at).getTime() >= sinds)
  const aantal = (st: string) => s.contacts.filter((c) => c.stage === st).length
  const mrr = s.contacts.filter((c) => isKlant(c.stage)).reduce((a, c) => a + c.value, 0)
  const pipeline = s.contacts.filter((c) => c.stage === 'voorstel').reduce((a, c) => a + c.value, 0)
  const max = Math.max(1, ...STAGES.map((st) => aantal(st.key)))
  return (
    <Widget kleur="crm" titel="CRM" icon="crm">
      <div className="results-grid">
        <Tegel label="Outreach" waarde={getal(contactmomenten.length)} onder="mails, WhatsApp en gesprekken, 30 dagen" />
        <Tegel label="Leads" waarde={getal(aantal('lead') + aantal('gemaild'))} onder={`${aantal('lead')} lead · ${aantal('gemaild')} gemaild`} />
        <Tegel label="Voorstellen uit" waarde={getal(aantal('voorstel'))} onder={pipeline ? `${euro(pipeline)} p.m.` : undefined} />
        <Tegel label="Klanten" waarde={getal(aantal('klant'))} onder={`${euro(mrr)} p.m.`} />
      </div>
      <div className="funnel">
        {STAGES.map((st) => (
          <div key={st.key} className="funnel-rij">
            <span className="small">{st.label}</span>
            <span className="funnel-balk"><i style={{ width: `${(aantal(st.key) / max) * 100}%` }} /></span>
            <strong className="small">{aantal(st.key)}</strong>
          </div>
        ))}
      </div>
    </Widget>
  )
}

function AnalyticsWidget({ live }: { live: boolean }) {
  const [periode, setPeriode] = useState<'7d' | '30d'>('7d')
  const [ga, setGa] = useState<Laden<AnalyticsCijfers>>(undefined)
  useEffect(() => {
    if (!live) return
    setGa(undefined)
    analytics(periode).then(setGa)
  }, [live, periode])
  const ok = ga && !isFout(ga) && ga.gekoppeld ? ga : null
  const top = Math.max(1, ...(ok?.kanalen ?? []).map((k) => k.sessies))
  return (
    <Widget kleur="analytics" titel="Website (Google Analytics)" icon="search" rechts={<Segmented value={periode} onChange={setPeriode} options={[{ value: '7d', label: '7 dagen' }, { value: '30d', label: '30 dagen' }]} />}>
      <div className="results-grid">
        <Tegel label="Bezoekers" waarde={ok ? getal(ok.nu!.bezoekers) : '—'} onder={ok && <Delta nu={ok.nu!.bezoekers} ervoor={ok.ervoor!.bezoekers} />} />
        <Tegel label="Sessies" waarde={ok ? getal(ok.nu!.sessies) : '—'} onder={ok && <Delta nu={ok.nu!.sessies} ervoor={ok.ervoor!.sessies} />} />
        <Tegel label="Conversies" waarde={ok ? getal(ok.nu!.conversies) : '—'} onder={ok ? <Delta nu={ok.nu!.conversies} ervoor={ok.ervoor!.conversies} /> : 'key events'} />
      </div>
      {ok && ok.kanalen!.length > 0 && (
        <div className="funnel">
          {ok.kanalen!.map((k) => (
            <div key={k.naam} className="funnel-rij">
              <span className="small">{k.naam}</span>
              <span className="funnel-balk"><i style={{ width: `${(k.sessies / top) * 100}%` }} /></span>
              <strong className="small">{getal(k.sessies)}</strong>
            </div>
          ))}
        </div>
      )}
      {ga && !isFout(ga) && !ga.gekoppeld && <p className="muted small">Nog niet gekoppeld: GA4-property-ID en het Google-serviceaccount als Viewer in GA4 (stappen in docs/PLAN.md).</p>}
      <NogNiet live={live} data={ga} wat="Google Analytics" />
    </Widget>
  )
}

const EIGEN_PERIODES: { value: EigenPeriode; label: string }[] = [
  { value: '7d', label: '7 dagen' },
  { value: 'maand', label: 'Deze maand' },
  { value: '30d', label: '30 dagen' },
]

function EigenMetaWidget({ live }: { live: boolean }) {
  const [periode, setPeriode] = useState<EigenPeriode>('7d')
  const [m, setM] = useState<Laden<{ gekoppeld: boolean; bijgewerkt?: string; cijfers?: MetaGetallen }>>(undefined)
  useEffect(() => {
    if (!live) return
    setM(undefined)
    eigenMeta(periode).then(setM)
  }, [live, periode])
  const c = m && !isFout(m) && m.gekoppeld ? m.cijfers : undefined
  const r = c ? resultaat(c) : null
  return (
    <Widget kleur="meta" titel="Eigen Meta-advertenties" icon="chart" rechts={<Segmented value={periode} onChange={setPeriode} options={EIGEN_PERIODES} />}>
      <div className="results-grid">
        <Tegel label="Uitgegeven" waarde={c ? geld(c.spend) : '—'} />
        <Tegel label={r?.koop ? 'Aankopen' : 'Leads'} waarde={r ? getal(r.n) : '—'} />
        <Tegel label={`Kosten per ${r?.enkel ?? 'lead'}`} waarde={r?.kosten != null ? geld(r.kosten) : '—'} />
        <Tegel label="ROAS" waarde={c?.roas != null ? `${c.roas.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}x` : '—'} />
      </div>
      {m && !isFout(m) && !m.gekoppeld && <p className="muted small">De eigen advertenties gaan in januari live. Daarna RISE_META_AD_ACCOUNT in Netlify zetten, dan staan de cijfers hier.</p>}
      {!live && <p className="muted small">De eigen advertenties gaan in januari live; daarna staan hier uitgaven, leads, kosten per lead en ROAS.</p>}
      {live && m === undefined && <SkeletRegels n={2} />}
      {isFout(m) && <p className="muted small">Niet op te halen: {m.fout}</p>}
    </Widget>
  )
}

const KLANT_PERIODES: { value: EigenPeriode; label: string }[] = [
  { value: '7d', label: '7 dagen' },
  { value: 'maand', label: 'Deze maand' },
  { value: '30d', label: '30 dagen' },
  { value: 'vorigeMaand', label: 'Vorige maand' },
]

/** Alle klanten als vakjes; klik = vakje wordt groot en haalt de cijfers op. */
function KlantenWidget({ live, go }: { live: boolean; go: (r: string) => void }) {
  const { s } = useStore()
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Widget breed titel="Klanten in één oogopslag" icon="clients" rechts={<span className="muted small">Klik op een klant voor de cijfers</span>}>
      <div className="klant-vakjes">
        {s.clients.map((c) => {
          const merk = s.contacts.find((x) => x.id === c.contactId)
          return open === c.id ? (
            <KlantGroot key={c.id} client={c} live={live} go={go} onClose={() => setOpen(null)} />
          ) : (
            <button key={c.id} className="klant-vakje" onClick={() => setOpen(c.id)}>
              <MerkLogo merk={merk} naam={c.name} size={36} />
              <span className="klant-vakje-tekst">
                <strong>{c.name}</strong>
                <span className="muted small">{faseVan(c).label}{c.metaAdAccount ? ' · Meta' : ''}{c.websiteWerk ? ' · Website' : ''}</span>
              </span>
            </button>
          )
        })}
        {s.clients.length === 0 && <p className="muted small">Nog geen klanten.</p>}
      </div>
    </Widget>
  )
}

function KlantGroot({ client, live, go, onClose }: { client: Client; live: boolean; go: (r: string) => void; onClose: () => void }) {
  const { s } = useStore()
  const [tab, setTab] = useState<'meta' | 'website'>('meta')
  const merk = s.contacts.find((x) => x.id === client.contactId)
  return (
    <div className="klant-groot">
      <div className="klant-groot-kop">
        <MerkLogo merk={merk} naam={client.name} size={44} />
        <div>
          <strong>{client.name}</strong>
          <div className="muted small">{faseVan(client).label}</div>
        </div>
        <div className="klant-groot-knoppen">
          <button className="btn small" onClick={() => go(`klanten/${client.id}`)}>Dossier</button>
          <button className="btn small" onClick={() => go(`portaal/${client.id}/als-klant`)}><Icon name="portal" size={13} /> Als klant</button>
          <button className="icon-btn" aria-label="Sluiten" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
      </div>
      {client.websiteWerk && (
        <div className="klant-tabs">
          <button className={tab === 'meta' ? 'on' : ''} onClick={() => setTab('meta')}>Meta-advertenties</button>
          <button className={tab === 'website' ? 'on' : ''} onClick={() => setTab('website')}>Website (Google Analytics)</button>
        </div>
      )}
      {tab === 'meta' || !client.websiteWerk ? <KlantMeta client={client} live={live} /> : <KlantWebsite client={client} live={live} />}
    </div>
  )
}

function KlantMeta({ client, live }: { client: Client; live: boolean }) {
  const [periode, setPeriode] = useState<EigenPeriode>('7d')
  const [m, setM] = useState<Laden<{ gekoppeld: boolean; bijgewerkt?: string; cijfers?: MetaGetallen }>>(undefined)
  useEffect(() => {
    if (!live || !client.metaAdAccount) return
    setM(undefined)
    klantMetaLive(client.id, periode).then(setM)
  }, [live, client.id, client.metaAdAccount, periode])
  const c = m && !isFout(m) && m.gekoppeld ? m.cijfers : undefined
  const r = c ? resultaat(c) : null
  let inhoud: ReactNode
  if (!client.metaAdAccount) inhoud = <p className="muted small">Nog geen Meta-advertentieaccount ingesteld. Vul het act_-nummer in bij het dossier.</p>
  else if (!live) inhoud = <p className="muted small">Lokaal geen Meta-koppeling. Na de livegang haalt dit vakje de cijfers van {client.name} direct op.</p>
  else if (m === undefined) inhoud = <p className="muted small">Cijfers ophalen bij Meta…</p>
  else if (isFout(m)) inhoud = <p className="muted small">Niet op te halen: {m.fout}</p>
  else if (!c || !r) inhoud = <p className="muted small">Meta is nog niet gekoppeld (META_ACCESS_TOKEN in Netlify).</p>
  else
    inhoud = (
      <div className="results-grid">
        <Tegel label="Uitgegeven" waarde={geld(c.spend)} />
        <Tegel label={r.koop ? 'Aankopen' : 'Leads'} waarde={getal(r.n)} />
        <Tegel label={`Kosten per ${r.enkel}`} waarde={r.kosten != null ? geld(r.kosten) : '—'} />
        {c.roas != null && <Tegel label="ROAS" waarde={`${c.roas.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}x`} />}
        {c.omzet > 0 && <Tegel label="Omzet uit advertenties" waarde={geld(c.omzet)} />}
        <Tegel label="Bereik" waarde={getal(c.bereik)} />
        <Tegel label="Klikken" waarde={getal(c.klikken)} />
      </div>
    )
  return (
    <div className="klant-tab-inhoud">
      <div className="klant-tab-balk">
        <Segmented value={periode} onChange={setPeriode} options={KLANT_PERIODES} />
        {m && !isFout(m) && m.bijgewerkt && <span className="muted small">bijgewerkt {fmtDateTime(m.bijgewerkt)}</span>}
      </div>
      {inhoud}
    </div>
  )
}

function KlantWebsite({ client, live }: { client: Client; live: boolean }) {
  const [periode, setPeriode] = useState<'7d' | '30d'>('7d')
  const [ga, setGa] = useState<Laden<AnalyticsCijfers>>(undefined)
  useEffect(() => {
    if (!live || !client.ga4PropertyId) return
    setGa(undefined)
    analytics(periode, client.id).then(setGa)
  }, [live, client.id, client.ga4PropertyId, periode])
  const ok = ga && !isFout(ga) && ga.gekoppeld ? ga : null
  const top = Math.max(1, ...(ok?.kanalen ?? []).map((k) => k.sessies))
  let inhoud: ReactNode
  if (!client.ga4PropertyId) inhoud = <p className="muted small">Nog geen GA4-property ingesteld. Vul het property-ID in bij het dossier en voeg het Rise-serviceaccount als Viewer toe in de GA4 van {client.name}.</p>
  else if (!live) inhoud = <p className="muted small">Lokaal geen Google Analytics. Na de livegang staan hier bezoekers, sessies, conversies en kanalen van de site van {client.name}.</p>
  else if (ga === undefined) inhoud = <p className="muted small">Cijfers ophalen bij Google Analytics…</p>
  else if (isFout(ga)) inhoud = <p className="muted small">Niet op te halen: {ga.fout}</p>
  else if (!ok) inhoud = <p className="muted small">Google is nog niet gekoppeld (serviceaccount in Netlify).</p>
  else
    inhoud = (
      <>
        <div className="results-grid">
          <Tegel label="Bezoekers" waarde={getal(ok.nu!.bezoekers)} onder={<Delta nu={ok.nu!.bezoekers} ervoor={ok.ervoor!.bezoekers} />} />
          <Tegel label="Sessies" waarde={getal(ok.nu!.sessies)} onder={<Delta nu={ok.nu!.sessies} ervoor={ok.ervoor!.sessies} />} />
          <Tegel label="Conversies" waarde={getal(ok.nu!.conversies)} onder={<Delta nu={ok.nu!.conversies} ervoor={ok.ervoor!.conversies} />} />
        </div>
        <div className="funnel">
          {ok.kanalen!.map((k) => (
            <div key={k.naam} className="funnel-rij">
              <span className="small">{k.naam}</span>
              <span className="funnel-balk"><i style={{ width: `${(k.sessies / top) * 100}%` }} /></span>
              <strong className="small">{getal(k.sessies)}</strong>
            </div>
          ))}
        </div>
      </>
    )
  return (
    <div className="klant-tab-inhoud">
      <div className="klant-tab-balk">
        <Segmented value={periode} onChange={setPeriode} options={[{ value: '7d', label: '7 dagen' }, { value: '30d', label: '30 dagen' }]} />
      </div>
      {inhoud}
    </div>
  )
}
