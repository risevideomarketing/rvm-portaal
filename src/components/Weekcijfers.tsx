import { useEffect, useState } from 'react'
import type { Client } from '../data/types'
import { weekoverzicht, type MetaGetallen, type Weekoverzicht } from '../slack'
import { isLive } from '../supabase'
import { euro } from '../utils'
import { Icon } from './ui'
import { SkeletRegels } from './ui'

/** Moment van de volgende update: maandag 07:00 (Nederlandse tijd = tijd van de browser in NL). */
export function volgendeUpdate(nu = new Date()): Date {
  const x = new Date(nu)
  x.setHours(7, 0, 0, 0)
  const tot = (8 - x.getDay()) % 7 // dagen tot maandag
  x.setDate(x.getDate() + tot)
  if (x <= nu) x.setDate(x.getDate() + 7)
  return x
}
export const volgendeUpdateTekst = (nu = new Date()) => {
  const d = volgendeUpdate(nu)
  return `${d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })} om 07:00`
}

const datum = (iso: string, maand = true) => new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', maand ? { day: 'numeric', month: 'long' } : { day: 'numeric' })
const weeknummer = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7)
}
export const getal = (n: number) => n.toLocaleString('nl-NL')
export const geld = (n: number) => (n < 100 ? n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' }) : euro(Math.round(n)))

/** Hoofdresultaat: aankopen als die er zijn, anders leads. */
export function resultaat(c: MetaGetallen) {
  const koop = c.aankopen > 0
  return { koop, n: koop ? c.aankopen : c.leads, enkel: koop ? 'aankoop' : 'lead', meer: koop ? 'aankopen' : 'leads', kosten: koop ? c.kostenPerAankoop : c.kostenPerLead }
}

/** Verschil met de week ervoor als percentage; goed = groen (bij kosten is omlaag goed). */
function Verschil({ nu, ervoor, lagerIsBeter }: { nu: number | null; ervoor: number | null; lagerIsBeter?: boolean }) {
  if (nu == null || ervoor == null || ervoor === 0) return null
  const pct = Math.round(((nu - ervoor) / ervoor) * 100)
  if (pct === 0) return <span className="verschil">gelijk aan de week ervoor</span>
  const goed = lagerIsBeter ? pct < 0 : pct > 0
  return <span className={`verschil ${goed ? 'goed' : 'minder'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% t.o.v. de week ervoor</span>
}

/** Eén zin over de week, in gewone taal. */
function samenvatting(naam: string, w: Weekoverzicht): string {
  const r = resultaat(w.week)
  const v = resultaat(w.vorige)
  if (r.n === 0) return `Vorige week zagen ${getal(w.week.bereik)} mensen de advertenties van ${naam}.`
  let zin = `Vorige week leverden je campagnes ${getal(r.n)} ${r.n === 1 ? r.enkel : r.meer} op`
  if (r.kosten != null && w.week.spend >= 0) zin += `, voor ${geld(r.kosten)} per ${r.enkel}`
  zin += '.'
  if (v.n > 0 && r.n > v.n) zin += ` Dat zijn er ${getal(r.n - v.n)} meer dan de week ervoor.`
  else if (v.n > 0 && r.n === v.n) zin += ' Net zoveel als de week ervoor.'
  if (w.week.roas != null) zin += ` Elke euro aan advertenties leverde ${geld(w.week.roas)} omzet op.`
  return zin
}

/** Het weekoverzicht zelf (ook los te tonen, bijv. in de statistieken). */
export function WeekKaart({ naam, w }: { naam: string; w: Weekoverzicht }) {
  const r = resultaat(w.week)
  const v = resultaat(w.vorige)
  const t = resultaat(w.totaal)
  const uitgaven = w.week.spend >= 0
  const tegels: { label: string; waarde: string; extra?: JSX.Element | null }[] = [
    { label: r.koop ? 'Aankopen' : 'Leads', waarde: getal(r.n), extra: <Verschil nu={r.n} ervoor={v.n} /> },
  ]
  if (uitgaven && r.kosten != null) tegels.push({ label: `Kosten per ${r.enkel}`, waarde: geld(r.kosten), extra: <Verschil nu={r.kosten} ervoor={v.kosten} lagerIsBeter /> })
  if (w.week.roas != null) tegels.push({ label: 'ROAS', waarde: `${w.week.roas.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}x`, extra: <Verschil nu={w.week.roas} ervoor={w.vorige.roas} /> })
  if (w.week.omzet > 0) tegels.push({ label: 'Omzet uit advertenties', waarde: geld(w.week.omzet), extra: <Verschil nu={w.week.omzet} ervoor={w.vorige.omzet} /> })
  if (uitgaven) tegels.push({ label: 'Uitgegeven', waarde: geld(w.week.spend) })
  return (
    <>
      <div className="week-kop">
        <span className="portal-kicker">Week {weeknummer(w.van)} · {datum(w.van, false)} t/m {datum(w.tot)}</span>
        <p className="week-zin">{samenvatting(naam, w)}</p>
      </div>
      <div className="results-grid">
        {tegels.map((x) => (
          <div key={x.label} className="result-tile"><span>{x.label}</span><strong>{x.waarde}</strong>{x.extra}</div>
        ))}
      </div>
      {t.n > 0 && (
        <p className="muted small week-totaal">
          Sinds de start: <strong>{getal(t.n)} {t.n === 1 ? t.enkel : t.meer}</strong>
          {uitgaven && <> · {geld(w.totaal.spend)} uitgegeven</>}
          {w.totaal.roas != null && <> · ROAS {w.totaal.roas.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}x</>}
        </p>
      )}
    </>
  )
}

/** Blok in het klantportaal: elke maandag om 07:00 een nieuw weekoverzicht, niet live. */
export function WeekResultaten({ client }: { client: Client }) {
  const [data, setData] = useState<Weekoverzicht | null | undefined | { fout: string }>(undefined)
  useEffect(() => {
    if (!isLive || !client.metaAdAccount) return
    setData(undefined)
    weekoverzicht(client.id).then((r) => setData('fout' in r ? r : r.overzicht))
  }, [client.id, client.metaAdAccount])

  const kop = (
    <div className="card-head">
      <h3><Icon name="chart" size={18} /> Resultaten van je campagnes</h3>
      <span className="volgende-update"><Icon name="calendar" size={14} /> Volgende update: {volgendeUpdateTekst()}</span>
    </div>
  )
  const leeg = (tekst: string) => <section className="portal-results">{kop}<p className="muted">{tekst}</p></section>
  if (!client.metaAdAccount) return leeg('Zodra je campagnes live staan, zie je hier elke maandagochtend wat ze de week ervoor hebben opgeleverd.')
  if (!isLive) return leeg('Lokaal haal ik geen Meta-cijfers op. Na de livegang staat hier elke maandag het weekoverzicht.')
  if (data === undefined) return <section className="portal-results"><SkeletRegels n={3} /></section>
  if (data && 'fout' in data) return leeg(`Het weekoverzicht is nu niet op te halen. ${data.fout}`)
  if (!data) return leeg(`Je eerste weekoverzicht staat hier ${volgendeUpdateTekst()}.`)
  return <section className="portal-results">{kop}<WeekKaart naam={client.name} w={data} /></section>
}
