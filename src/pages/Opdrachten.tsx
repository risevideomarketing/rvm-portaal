// Opdrachten: wat de dagelijkse scan vindt op Young Creators, Freelancer.nl, Hoofdkraan, TenderNed en het web.
// Live uit de Supabase-tabel opdrachten (alleen het team), lokaal uit lokaal.json (in localStorage).
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/ui'
import { OPDRACHTEN } from '../data/mock'
import type { Opdracht } from '../data/types'
import { supabase } from '../supabase'
import { fmtDate } from '../utils'

const BRONNEN: Record<string, string> = { yc: 'Young Creators', fl: 'Freelancer.nl', hk: 'Hoofdkraan', tn: 'TenderNed', web: 'Web' }
const bronVan = (o: Opdracht) => BRONNEN[o.id.split('-')[0]] ?? o.source
const LOKAAL = 'rvm-opdrachten'
type Filter = 'nieuw' | 'bewaard' | 'alles'

function useOpdrachten() {
  const [lijst, setLijst] = useState<Opdracht[]>([])
  const [laden, setLaden] = useState(true)
  useEffect(() => {
    if (supabase) {
      const sb = supabase
      sb.from('opdrachten').select('data').order('updated_at', { ascending: false }).then(({ data }) => {
        setLijst((data ?? []).map((r) => r.data as Opdracht))
        setLaden(false)
      })
      const ch = sb.channel('opdrachten').on('postgres_changes', { event: '*', schema: 'public', table: 'opdrachten' }, (p) => {
        const o = (p.new as { data?: Opdracht })?.data
        if (o) setLijst((l) => [o, ...l.filter((x) => x.id !== o.id)])
      }).subscribe()
      return () => { sb.removeChannel(ch) }
    }
    try { setLijst(JSON.parse(localStorage.getItem(LOKAAL) ?? 'null') ?? OPDRACHTEN) } catch { setLijst(OPDRACHTEN) }
    setLaden(false)
  }, [])
  const zet = (o: Opdracht) => {
    setLijst((l) => {
      const nieuw = l.map((x) => (x.id === o.id ? o : x))
      if (!supabase) try { localStorage.setItem(LOKAAL, JSON.stringify(nieuw)) } catch { /* vol */ }
      return nieuw
    })
    supabase?.from('opdrachten').upsert({ id: o.id, data: o, updated_at: new Date().toISOString() }).then(({ error }) => error && console.error('Opdracht opslaan mislukt', error))
  }
  return { lijst, laden, zet }
}

export function Opdrachten(_: { go: (r: string) => void }) {
  const { lijst, laden, zet } = useOpdrachten()
  const [filter, setFilter] = useState<Filter>('nieuw')
  const [bron, setBron] = useState('alle')
  const zichtbaar = useMemo(() => lijst
    .filter((o) => (filter === 'nieuw' ? o.status === 'open' : filter === 'bewaard' ? o.status === 'bewaard' || o.status === 'lead' : true))
    .filter((o) => bron === 'alle' || bronVan(o) === bron)
    .sort((a, b) => b.relevance - a.relevance || b.found_at.localeCompare(a.found_at)), [lijst, filter, bron])
  const telling = (f: Filter) => lijst.filter((o) => (f === 'nieuw' ? o.status === 'open' : f === 'bewaard' ? o.status === 'bewaard' || o.status === 'lead' : true)).length
  const bronnen = [...new Set(lijst.map(bronVan))].sort()

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Opdrachten</h1>
          <p className="muted">Elke ochtend gezocht op Young Creators, Freelancer.nl, Hoofdkraan, TenderNed en het web. Bewaar wat je wilt oppakken, gooi de rest weg.</p>
        </div>
      </div>
      <div className="chips op-chips">
        {(['nieuw', 'bewaard', 'alles'] as Filter[]).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f === 'nieuw' ? 'Nieuw' : f === 'bewaard' ? 'Bewaard' : 'Alles'} <span className="aantal">{telling(f)}</span></button>
        ))}
        <select value={bron} onChange={(e) => setBron(e.target.value)} aria-label="Bron">
          <option value="alle">Alle bronnen</option>
          {bronnen.map((b) => <option key={b}>{b}</option>)}
        </select>
      </div>
      {laden ? <p className="muted">Laden…</p> : zichtbaar.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>{filter === 'nieuw' ? 'Niks nieuws. Morgenochtend kijkt de scan weer.' : 'Nog niks bewaard.'}</p></div>
      ) : (
        <ul className="op-lijst">
          {zichtbaar.map((o) => (
            <li key={o.id} className={`card op op-r${o.relevance} ${o.status === 'weg' ? 'weg' : ''}`}>
              <div className="op-kop">
                <span className={`op-rel r${o.relevance}`} title="Hoe goed het past">{o.relevance === 3 ? 'Past sterk' : o.relevance === 2 ? 'Passend' : 'Klein'}</span>
                <span className="muted small">{bronVan(o)}{o.type ? ` · ${o.type}` : ''} · gevonden {fmtDate(o.found_at)}</span>
              </div>
              <a className="op-titel" href={o.url} target="_blank" rel="noreferrer">{o.title} <Icon name="external" size={13} /></a>
              <div className="op-meta small">
                {o.client && <span><Icon name="clients" size={13} /> {o.client}</span>}
                {o.location && <span><Icon name="home" size={13} /> {o.location}</span>}
                {o.budget && <span><Icon name="chart" size={13} /> {o.budget}</span>}
                {o.deadline && <span><Icon name="calendar" size={13} /> {o.deadline}</span>}
              </div>
              <div className="op-acties">
                {o.status === 'lead' && <span className="badge">In CRM</span>}
                {o.status !== 'bewaard' && o.status !== 'lead' && <button className="btn small" onClick={() => zet({ ...o, status: 'bewaard' })}><Icon name="check" size={13} /> Bewaren</button>}
                {o.status !== 'weg' ? <button className="btn small ghost" onClick={() => zet({ ...o, status: 'weg' })}><Icon name="x" size={13} /> Weg</button> : <button className="btn small ghost" onClick={() => zet({ ...o, status: 'open' })}>Terugzetten</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
