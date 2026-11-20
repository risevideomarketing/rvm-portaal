import { useEffect, useState } from 'react'
import type { Client, CommissieVenster } from '../data/types'
import { commissieFactureren, commissieOphalen, type Commissie } from '../slack'
import { useStore } from '../store'
import { fmtDateTime } from '../utils'
import { personName } from './ui'

export const VENSTERS: { key: CommissieVenster; label: string }[] = [
  { key: '7d_click', label: 'Meta-aankopen, 7 dagen na klik' },
  { key: '1d_click', label: 'Meta-aankopen, 1 dag na klik' },
  { key: '7d_click_1d_view', label: 'Meta-aankopen, 7 dagen na klik of 1 dag na weergave' },
]

const euro2 = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
const maandVan = (offset: number) => {
  const x = new Date()
  x.setDate(1)
  x.setMonth(x.getMonth() + offset)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}

/** De berekening zoals de klant hem ziet (ook gebruikt in het portaal). */
export function CommissieBerekening({ c }: { c: Commissie }) {
  return (
    <table className="commissie-tabel">
      <tbody>
        <tr><td className="muted">Afspraak</td><td>{c.pct}% van de aankoopwaarde · {c.afspraak.toLowerCase()}</td></tr>
        <tr><td className="muted">Periode</td><td>{c.maandNaam}{c.loopt ? ` (t/m ${new Date(`${c.tot}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}, loopt nog)` : ''}</td></tr>
        <tr><td className="muted">Aankopen via Meta</td><td>{c.aankopen.toLocaleString('nl-NL')}</td></tr>
        <tr><td className="muted">Aankoopwaarde (incl. btw)</td><td>{euro2(c.aankoopwaarde)}</td></tr>
        <tr><td className="muted">Gedeeld door 1,21 (ex btw)</td><td>{euro2(c.exBtw)}</td></tr>
        <tr className="totaal"><td>Commissie {c.pct}%</td><td>{euro2(c.bedrag)} <span className="muted small">ex btw</span></td></tr>
      </tbody>
    </table>
  )
}

/** Instellingen en berekening per maand in het klantprofiel, met de knop naar de conceptfactuur. */
export function CommissieBlok({ client, update }: { client: Client; update: (p: Partial<Client>) => void }) {
  const { s } = useStore()
  const [maand, setMaand] = useState(maandVan(-1))
  const [c, setC] = useState<Commissie | null>(null)
  const [melding, setMelding] = useState('')
  const [bezig, setBezig] = useState(false)
  const actief = Boolean(client.commissiePct && client.metaAdAccount)

  useEffect(() => {
    if (!actief || !s.live) return setC(null)
    let stop = false
    setMelding('Berekenen…')
    commissieOphalen(client.id, maand).then((r) => {
      if (stop) return
      if ('fout' in r) { setC(null); setMelding(r.fout) } else { setC(r); setMelding('') }
    })
    return () => { stop = true }
  }, [actief, s.live, client.id, maand, client.commissiePct, client.commissieVenster])

  const factureer = async () => {
    if (!c) return
    if (!window.confirm(`${euro2(c.bedrag)} commissie over ${c.maandNaam} op de conceptfactuur van ${client.name} in Moneybird zetten? Er wordt niets verstuurd.`)) return
    setBezig(true)
    const r = await commissieFactureren(client.id, maand)
    setBezig(false)
    if ('fout' in r) return setMelding(r.fout)
    setC(r)
    update({ commissieGefactureerd: { ...(client.commissieGefactureerd ?? {}), [maand]: r.gefactureerd! } })
    setMelding(r.nieuwConcept ? 'Nieuwe conceptfactuur aangemaakt in Moneybird met de commissieregel.' : 'Commissieregel staat op de conceptfactuur in Moneybird.')
  }

  return (
    <div className="card">
      <div className="info-list">
        <div><span className="muted">Percentage</span>
          <input className="inline-input" type="number" min={0} max={100} step={0.5} placeholder="Bijv. 10 (leeg = geen commissie)" value={client.commissiePct ?? ''} onChange={(e) => update({ commissiePct: Number(e.target.value) || undefined })} />
        </div>
        <div><span className="muted">Wat telt</span>
          <select value={client.commissieVenster ?? '7d_click'} onChange={(e) => update({ commissieVenster: e.target.value as CommissieVenster })}>
            {VENSTERS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </div>
      </div>
      {!client.metaAdAccount && <p className="muted small">Vul eerst het Meta-account in bij Gegevens.</p>}
      {actief && (
        <>
          <div className="commissie-maand">
            <select value={maand} onChange={(e) => setMaand(e.target.value)}>
              {[0, -1, -2, -3, -4, -5].map((o) => { const m = maandVan(o); return <option key={m} value={m}>{new Date(`${m}-15`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}{o === 0 ? ' (loopt)' : ''}</option> })}
            </select>
          </div>
          {!s.live && <p className="muted small">Lokaal wordt er niets berekend; live haalt het dashboard de aankoopwaarde uit Meta.</p>}
          {c && <CommissieBerekening c={c} />}
          {c?.gefactureerd && <p className="small ok-tekst">Staat op de conceptfactuur: {euro2(c.gefactureerd.bedrag)} · {c.gefactureerd.by ? `${personName(c.gefactureerd.by)}, ` : ''}{fmtDateTime(c.gefactureerd.at)}</p>}
          {c && c.bedrag > 0 && (
            <button className="btn primary small" onClick={factureer} disabled={bezig || c.loopt}>
              {bezig ? 'Bezig…' : c.gefactureerd ? 'Opnieuw op conceptfactuur zetten' : 'Zet op conceptfactuur'}
            </button>
          )}
          {c?.loopt && c.bedrag > 0 && <span className="muted small" style={{ marginLeft: 8 }}>Kan pas als de maand voorbij is.</span>}
          {melding && <p className="muted small">{melding}</p>}
          <p className="muted small" style={{ marginBottom: 0 }}>De klant ziet deze berekening in het portaal. Leg vooraf schriftelijk vast wat als aankoop telt.</p>
        </>
      )}
    </div>
  )
}
