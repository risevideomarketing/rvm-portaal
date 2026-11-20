// Strippenkaart per klant: in het dossier snel bij te werken (afvinken, titel, datum), in het portaal precies zien wat er over is.
import { useState } from 'react'
import { STANDAARD_SPELREGELS, STRIP_MATEN } from '../data/mock'
import type { Client, Strip, Strippenkaart } from '../data/types'
import { uid, useStore } from '../store'
import { fmtDate } from '../utils'
import { Icon } from './ui'

type Maat = Strip['maat']
const euro = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

const SJABLONEN: { naam: string; maat: Maat; aantal: number }[] = [
  { naam: '5 kleine shoots', maat: 'klein', aantal: 5 },
  { naam: '6 medium shoots', maat: 'medium', aantal: 6 },
  { naam: '10 kleine shoots', maat: 'klein', aantal: 10 },
]

/** Hoeveel strippen zijn er over (halve strip telt als een halve). */
export function stripTelling(k: Strippenkaart) {
  const w = (s: Strip) => (s.maat === 'halve' ? 0.5 : 1)
  const totaal = k.strippen.reduce((a, s) => a + w(s), 0)
  const gebruikt = k.strippen.filter((s) => s.done).reduce((a, s) => a + w(s), 0)
  return { totaal, gebruikt, over: totaal - gebruikt }
}
const getal = (n: number) => String(n).replace('.', ',')

/** Dossier (team): strippenkaart aanmaken en bijwerken. Elke wijziging wordt direct opgeslagen. */
export function StrippenkaartBeheer({ client }: { client: Client }) {
  const { d } = useStore()
  const k = client.strippenkaart
  const zet = (nieuw: Strippenkaart | undefined) => d({ type: 'client:upsert', client: { ...client, strippenkaart: nieuw } })
  const strip = (id: string, patch: Partial<Strip>) => k && zet({ ...k, strippen: k.strippen.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  const [regelsOpen, setRegelsOpen] = useState(false)

  if (!k) {
    return (
      <div className="card sk-leeg">
        <p className="muted small" style={{ margin: 0 }}>Geen strippenkaart. De klant ziet in zijn portaal "Je hebt geen strippenkaart".</p>
        <div className="sk-sjablonen">
          {SJABLONEN.map((sj) => (
            <button key={sj.naam} className="btn small" onClick={() => zet({
              titel: `Strippenkaart ${new Date().getFullYear() + (new Date().getMonth() >= 10 ? 1 : 0)}`,
              strippen: Array.from({ length: sj.aantal }, () => ({ id: uid(), titel: '', maat: sj.maat, done: false })),
              facturatie: [],
              spelregels: STANDAARD_SPELREGELS,
            })}><Icon name="plus" size={13} /> {sj.naam}</button>
          ))}
        </div>
      </div>
    )
  }
  const t = stripTelling(k)
  return (
    <div className="card sk">
      <div className="sk-kop">
        <input className="inline-input sk-titel" value={k.titel} onChange={(e) => zet({ ...k, titel: e.target.value })} aria-label="Naam van de strippenkaart" />
        <span className="sk-teller"><strong>{getal(t.over)}</strong> van {getal(t.totaal)} over</span>
      </div>
      <ul className="sk-strippen">
        {k.strippen.map((s, i) => (
          <li key={s.id} className={s.done ? 'af' : ''}>
            <button className={`sk-vink ${s.done ? 'aan' : ''}`} onClick={() => strip(s.id, { done: !s.done, datum: !s.done && !s.datum ? new Date().toISOString().slice(0, 10) : s.datum })} aria-label={s.done ? 'Weer openzetten' : 'Gebruikt'}>{s.done && <Icon name="check" size={12} />}</button>
            <span className="sk-n">{i + 1}</span>
            <input className="inline-input sk-strip-titel" placeholder="Nog niet ingevuld (bijv. Ondernemersdiner)" value={s.titel} onChange={(e) => strip(s.id, { titel: e.target.value })} />
            <select value={s.maat} onChange={(e) => strip(s.id, { maat: e.target.value as Maat })} aria-label="Soort strip">
              {Object.entries(STRIP_MATEN).map(([m, x]) => <option key={m} value={m}>{x.label}</option>)}
            </select>
            <input type="date" value={s.datum ?? ''} onChange={(e) => strip(s.id, { datum: e.target.value || undefined })} aria-label="Datum" />
            <button className="icon-btn" aria-label="Strip weghalen" onClick={() => window.confirm('Deze strip weghalen?') && zet({ ...k, strippen: k.strippen.filter((x) => x.id !== s.id) })}><Icon name="x" size={13} /></button>
          </li>
        ))}
      </ul>
      <button className="link small" onClick={() => zet({ ...k, strippen: [...k.strippen, { id: uid(), titel: '', maat: k.strippen[k.strippen.length - 1]?.maat ?? 'klein', done: false }] })}>+ Strip toevoegen</button>

      <div className="sk-blok">
        <strong className="small">Facturatie</strong>
        <ul className="sk-termijnen">
          {k.facturatie.map((f) => (
            <li key={f.id} className={f.gefactureerd ? 'af' : ''}>
              <button className={`sk-vink ${f.gefactureerd ? 'aan' : ''}`} onClick={() => zet({ ...k, facturatie: k.facturatie.map((x) => (x.id === f.id ? { ...x, gefactureerd: !x.gefactureerd } : x)) })} aria-label="Gefactureerd">{f.gefactureerd && <Icon name="check" size={12} />}</button>
              <input type="date" value={f.datum} onChange={(e) => zet({ ...k, facturatie: k.facturatie.map((x) => (x.id === f.id ? { ...x, datum: e.target.value } : x)) })} />
              <input className="inline-input" value={f.omschrijving} placeholder="Omschrijving, bijv. 25%" onChange={(e) => zet({ ...k, facturatie: k.facturatie.map((x) => (x.id === f.id ? { ...x, omschrijving: e.target.value } : x)) })} />
              <input className="inline-input sk-bedrag" type="number" min={0} step={0.01} placeholder="€ excl. btw" value={f.bedrag ?? ''} onChange={(e) => zet({ ...k, facturatie: k.facturatie.map((x) => (x.id === f.id ? { ...x, bedrag: Number(e.target.value) || undefined } : x)) })} />
              <button className="icon-btn" aria-label="Termijn weghalen" onClick={() => zet({ ...k, facturatie: k.facturatie.filter((x) => x.id !== f.id) })}><Icon name="x" size={13} /></button>
            </li>
          ))}
        </ul>
        <button className="link small" onClick={() => {
          const vorige = k.facturatie[k.facturatie.length - 1]
          const datum = vorige ? (() => { const x = new Date(`${vorige.datum}T12:00:00`); x.setMonth(x.getMonth() + 3); return x.toISOString().slice(0, 10) })() : new Date().toISOString().slice(0, 10)
          zet({ ...k, facturatie: [...k.facturatie, { id: uid(), datum, omschrijving: vorige?.omschrijving ?? '25%', bedrag: vorige?.bedrag, gefactureerd: false }] })
        }}>+ Termijn toevoegen</button>
      </div>

      <div className="sk-blok">
        <button className="link small" onClick={() => setRegelsOpen(!regelsOpen)}>{regelsOpen ? 'Spelregels verbergen' : 'Spelregels aanpassen'}</button>
        {regelsOpen && <textarea rows={6} value={k.spelregels.join('\n')} onChange={(e) => zet({ ...k, spelregels: e.target.value.split('\n').filter((r) => r.trim()) })} />}
      </div>
      <button className="link small sk-weg" onClick={() => window.confirm(`De strippenkaart van ${client.name} weghalen?`) && zet(undefined)}>Strippenkaart weghalen</button>
    </div>
  )
}

/** Portaal (klant): wat er over is, wat er al gemaakt is, de spelregels en de facturatie. */
export function StrippenkaartKlant({ client }: { client: Client }) {
  const k = client.strippenkaart
  if (!k || k.strippen.length === 0) {
    return (
      <section className="portal-card sk-portaal">
        <Icon name="board" size={22} />
        <h3>Strippenkaart</h3>
        <p className="muted">Je hebt geen strippenkaart.</p>
        <p className="muted small">Vaker video nodig? Met een strippenkaart koop je een aantal shoots vooraf in en roep je ze af wanneer het jou uitkomt. Stuur ons gerust een berichtje.</p>
      </section>
    )
  }
  const t = stripTelling(k)
  return (
    <>
      <section className="sv-hero sk-hero">
        <div className="sv-hero-tekst">
          <span className="sv-kicker">{k.titel}</span>
          <h2>{t.over === 0 ? 'Alle strippen zijn gebruikt' : `Je hebt nog ${getal(t.over)} ${t.over === 1 ? 'strip' : 'strippen'} over`}</h2>
          <p>{t.over === 0 ? 'Mooi gebruikt! Wil je verlengen of een nieuwe strippenkaart? Stuur ons een berichtje.' : 'Een strip gebruiken? Laat het ons weten per mail, telefoon of via het berichtje onderaan. Wij regelen de rest.'}</p>
        </div>
        <div className="sv-hero-cijfers sk-cijfers">
          <div><span>Over</span><strong>{getal(t.over)}</strong></div>
          <div><span>Gebruikt</span><strong>{getal(t.gebruikt)}</strong></div>
          <div><span>Totaal</span><strong>{getal(t.totaal)}</strong></div>
        </div>
      </section>
      <section className="portal-card sk-portaal">
        <Icon name="board" size={22} />
        <h3>Je strippen</h3>
        <ul className="sk-lijst">
          {k.strippen.map((s, i) => (
            <li key={s.id} className={s.done ? 'af' : ''}>
              <span className={`sk-bol ${s.done ? 'aan' : ''}`}>{s.done ? <Icon name="check" size={12} /> : i + 1}</span>
              <span className="sk-tekst">
                <strong>{STRIP_MATEN[s.maat].label}{s.titel ? `: ${s.titel}` : ''}</strong>
                <span className="muted small">{s.done ? `Gebruikt${s.datum ? ` · ${fmtDate(s.datum)}` : ''}` : s.datum ? `Gepland · ${fmtDate(s.datum)}` : 'Nog te gebruiken'}</span>
                {!s.done && <span className="muted small sk-uitleg">{STRIP_MATEN[s.maat].uitleg}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <div className="portal-grid portal-grid-2 sv-rij">
        <section className="portal-card">
          <Icon name="book" size={22} />
          <h3>Spelregels</h3>
          <ul className="sk-regels">{k.spelregels.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </section>
        <section className="portal-card">
          <Icon name="note" size={22} />
          <h3>Facturatie</h3>
          {k.facturatie.length === 0 ? <p className="muted">De factuurmomenten staan hier zodra ze zijn afgesproken.</p> : (
            <ul className="sk-lijst sk-fact">
              {k.facturatie.map((f) => (
                <li key={f.id} className={f.gefactureerd ? 'af' : ''}>
                  <span className={`sk-bol ${f.gefactureerd ? 'aan' : ''}`}>{f.gefactureerd ? <Icon name="check" size={12} /> : ''}</span>
                  <span className="sk-tekst"><strong>{fmtDate(f.datum)}</strong><span className="muted small">{[f.omschrijving, f.bedrag ? `${euro(f.bedrag)} excl. btw` : ''].filter(Boolean).join(' · ')}{f.gefactureerd ? ' · gefactureerd' : ''}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
