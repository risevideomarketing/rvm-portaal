import { useEffect, useRef, useState } from 'react'
import { Icon } from './ui'
import { supabase } from '../supabase'

/**
 * Frame.io in het portaal.
 * Met de Frame.io-koppeling (Instellingen → Frame.io): eigen speler + feedback in het vak, via de Frame.io API.
 * De opmerkingen komen gewoon in Frame.io terecht. Zonder koppeling: het ingesloten Frame.io-venster om te kijken.
 * (Reageren in het ingesloten Frame.io-venster zelf faalt: browsers blokkeren daar de cookies van Frame.io.)
 */
export const frameInsluitbaar = (url?: string) => {
  if (!url) return false
  try {
    const u = new URL(url.trim())
    return /(^|\.)frame\.io$/.test(u.hostname) && u.hostname !== 'f.io' && /\/(share|presentations|reviews|player)\//.test(u.pathname + '/')
  } catch { return false }
}

async function fio(query: string, init: RequestInit = {}): Promise<Response | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  return fetch(`/.netlify/functions/frameio?${query}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Supabase-Token': token, ...(init.headers ?? {}) } })
}

type Video = { id: string; naam: string; thumb: string | null }
type Opmerking = { id: string; tekst: string; sec: number | null; wie: string; at: string }
type Bestand = { id: string; naam: string; src: string | null; opmerkingen: Opmerking[] }

const FR_CSS = `.fr{gap:12px}.fr-lijst{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}.fr-lijst button{display:flex;align-items:center;gap:8px;flex:none;max-width:240px;padding:6px 10px 6px 6px;border-radius:10px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;text-align:left}.fr-lijst button.aan{border-color:currentColor}.fr-lijst img,.fr-geen{width:56px;height:32px;border-radius:6px;object-fit:cover;flex:none;background:#0d1522;display:flex;align-items:center;justify-content:center}.fr-lijst span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fr-werk{display:grid;grid-template-columns:1fr;gap:12px}@media(min-width:900px){.fr-werk{grid-template-columns:minmax(0,1fr) 340px}}.fr-speler{display:flex;flex-direction:column;gap:8px;min-width:0}.fr-speler video{width:100%;max-height:70vh;border-radius:12px;background:#000;display:block}.fr-laden{aspect-ratio:16/9;border-radius:12px;background:#0d1522;color:#c7d0da;display:flex;align-items:center;justify-content:center;font-size:14px;padding:20px;text-align:center}.fr-titel{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:14px}.fr-titel a{display:inline-flex;align-items:center;gap:5px;font-size:13px;opacity:.8;color:inherit}.fr-paneel{display:flex;flex-direction:column;gap:10px;border-radius:12px;border:1px solid var(--line);padding:14px;min-height:0}.frame-embed.donker .fr-paneel{border-color:#23324a;background:#0f1a2c}.fr-paneel h4{margin:0;font-size:15px}.fr-opm{display:flex;flex-direction:column;gap:6px;max-height:42vh;overflow-y:auto}.fr-leeg{font-size:13px;opacity:.75;margin:0}.fr-o{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;text-align:left;padding:8px 10px;border-radius:10px;border:0;background:rgba(127,140,160,.12);color:inherit;font:inherit;font-size:13px;cursor:pointer}.fr-o small{grid-column:2;opacity:.65;font-size:12px}.fr-tc{font-variant-numeric:tabular-nums;font-weight:600;padding:1px 6px;border-radius:6px;background:rgba(127,140,160,.22);height:fit-content}.fr-o .fr-t{grid-column:2;grid-row:1;white-space:pre-wrap}.fr-o:not(:has(.fr-tc)) .fr-t,.fr-o:not(:has(.fr-tc)) small{grid-column:1/-1}.fr-nieuw{display:flex;flex-direction:column;gap:8px;margin-top:auto}.fr-nieuw input,.fr-nieuw textarea{width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--line);padding:9px 11px;font:inherit;font-size:14px;background:#fff;color:#0c1625;resize:vertical}.fr-plaats{border:0;border-radius:10px;padding:10px 14px;font:inherit;font-size:14px;font-weight:500;background:#0c1625;color:#fff;cursor:pointer}.frame-embed.donker .fr-plaats{background:#fff;color:#0c1625}.fr-plaats:disabled{opacity:.45;cursor:default}.fr-melding{margin:0;font-size:13px;opacity:.85}`

const tijd = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const NAAM_KEY = 'rise-feedback-naam'

export function FrameEmbed({ url, titel = 'Video\'s en feedback', donker = false, klantId }: { url?: string; titel?: string; donker?: boolean; klantId?: string }) {
  const [videos, setVideos] = useState<Video[] | null>(null)
  const [api, setApi] = useState<'laden' | 'aan' | 'uit'>('laden')
  const extra = klantId ? `&klant=${encodeURIComponent(klantId)}` : ''

  useEffect(() => {
    let weg = false
    setApi('laden')
    fio(`actie=lijst${extra}`).then(async (r) => {
      if (weg) return
      if (!r || !r.ok) return setApi('uit')
      const j = await r.json() as { videos?: Video[] }
      if (!j.videos?.length) return setApi('uit')
      setVideos(j.videos); setApi('aan')
    }).catch(() => { if (!weg) setApi('uit') })
    return () => { weg = true }
  }, [url, extra])

  if (!url?.trim()) return null
  const link = url.trim()
  if (api === 'aan' && videos) return <Review videos={videos} extra={extra} donker={donker} link={link} />

  const kort = /^https?:\/\/f\.io\//i.test(link)
  return (
    <div className={`frame-embed ${donker ? 'donker' : ''}`}>
      {api === 'laden' && <p className="frame-embed-uitleg">Video's laden…</p>}
      {frameInsluitbaar(link) ? (
        <div className="frame-embed-venster">
          <iframe src={link} title={`Frame.io · ${titel}`} allow="autoplay; fullscreen; picture-in-picture; clipboard-write" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      ) : kort ? (
        <p className="frame-embed-uitleg">Deze korte f.io-link kan niet in de pagina getoond worden. Open hem in Frame.io.</p>
      ) : null}
    </div>
  )
}

function Review({ videos, extra, donker, link }: { videos: Video[]; extra: string; donker: boolean; link: string }) {
  const [actief, setActief] = useState(videos[0].id)
  const [b, setB] = useState<Bestand | null>(null)
  const [fout, setFout] = useState('')
  const [tekst, setTekst] = useState('')
  const [naam, setNaam] = useState(() => { try { return localStorage.getItem(NAAM_KEY) ?? '' } catch { return '' } })
  const [nu, setNu] = useState(0)
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState('')
  const vid = useRef<HTMLVideoElement>(null)

  const laad = async (id: string) => {
    setFout('')
    const r = await fio(`actie=bestand&id=${encodeURIComponent(id)}${extra}`)
    if (!r?.ok) { setFout('Deze video kon niet geladen worden. Probeer het zo nog eens.'); return }
    setB(await r.json() as Bestand)
  }
  useEffect(() => { setB(null); setMelding(''); laad(actief) }, [actief])

  const plaats = async () => {
    const t = tekst.trim()
    if (!t || bezig) return
    setBezig(true); setMelding('')
    try { localStorage.setItem(NAAM_KEY, naam) } catch { /* privémodus */ }
    const sec = vid.current ? vid.current.currentTime : nu
    const r = await fio(extra.slice(1), { method: 'POST', body: JSON.stringify({ id: actief, tekst: t, sec, naam }) })
    setBezig(false)
    if (!r?.ok) { setMelding('Plaatsen lukte niet. Probeer het nog eens.'); return }
    setTekst(''); setMelding('Dank je! Je feedback staat erbij.')
    laad(actief)
  }

  const naar = (s: number | null) => { if (s == null || !vid.current) return; vid.current.currentTime = s; vid.current.pause() }

  return (
    <div className={`frame-embed fr ${donker ? 'donker' : ''}`}>
      <style>{FR_CSS}</style>
      {videos.length > 1 && (
        <div className="fr-lijst" role="tablist">
          {videos.map((v) => (
            <button key={v.id} role="tab" aria-selected={v.id === actief} className={v.id === actief ? 'aan' : ''} onClick={() => setActief(v.id)}>
              {v.thumb ? <img src={v.thumb} alt="" loading="lazy" /> : <span className="fr-geen"><Icon name="play" size={16} /></span>}
              <span>{v.naam}</span>
            </button>
          ))}
        </div>
      )}
      <div className="fr-werk">
        <div className="fr-speler">
          {b?.src ? <video ref={vid} key={b.id} src={b.src} controls playsInline preload="metadata" onTimeUpdate={(e) => setNu(e.currentTarget.currentTime)} onPause={(e) => setNu(e.currentTarget.currentTime)} />
            : <div className="fr-laden">{fout || (b ? 'Deze video wordt nog verwerkt door Frame.io.' : 'Video laden…')}</div>}
          {b && <div className="fr-titel"><strong>{b.naam}</strong><a href={link} target="_blank" rel="noreferrer">Open in Frame.io <Icon name="external" size={12} /></a></div>}
        </div>
        <div className="fr-paneel">
          <h4>Feedback</h4>
          <div className="fr-opm">
            {!b ? <p className="fr-leeg">Laden…</p> : b.opmerkingen.length === 0 ? <p className="fr-leeg">Nog geen feedback. Pauzeer de video op het juiste moment en typ hieronder je opmerking.</p>
              : b.opmerkingen.map((o) => (
                <button key={o.id} className="fr-o" onClick={() => naar(o.sec)}>
                  {o.sec != null && <span className="fr-tc">{tijd(o.sec)}</span>}
                  <span className="fr-t">{o.tekst}</span>
                  {o.wie && <small>{o.wie}</small>}
                </button>
              ))}
          </div>
          <div className="fr-nieuw">
            <input placeholder="Je naam" value={naam} onChange={(e) => setNaam(e.target.value)} />
            <textarea placeholder={`Je feedback op ${tijd(nu)}…`} value={tekst} onChange={(e) => setTekst(e.target.value)} rows={3}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) plaats() }} onFocus={() => vid.current?.pause()} />
            <button className="fr-plaats" disabled={!tekst.trim() || bezig || !b} onClick={plaats}>{bezig ? 'Plaatsen…' : `Plaats bij ${tijd(nu)}`}</button>
            {melding && <p className="fr-melding">{melding}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Instellingen: Frame.io koppelen (eenmalig inloggen met het Adobe-account van Rise). */
export function FrameioKoppeling() {
  const [status, setStatus] = useState<boolean | null>(null)
  useEffect(() => { fetch('/.netlify/functions/frameio?actie=status').then((r) => r.json()).then((j) => setStatus(Boolean(j.gekoppeld))).catch(() => setStatus(false)) }, [])
  const koppel = async () => {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    const t = data.session?.access_token
    if (t) window.location.href = `/.netlify/functions/frameio-auth?start=1&t=${encodeURIComponent(t)}`
  }
  const terug = typeof window !== 'undefined' ? window.location.hash.match(/frameio=(ok|fout)/)?.[1] : undefined
  return (
    <div className="card instellingen-blok">
      <h3 className="section-title" style={{ marginTop: 0 }}>Frame.io</h3>
      <p className="muted small" style={{ marginTop: 0 }}>Met de koppeling kijken klanten hun video's en geven ze feedback direct in het portaal. De opmerkingen komen in Frame.io.</p>
      {terug === 'fout' && <p className="small" style={{ color: 'var(--red, #c0392b)' }}>Koppelen is niet gelukt. Probeer het opnieuw.</p>}
      <div className="instelling-rij">
        <strong>{status == null ? 'Status laden…' : status ? 'Gekoppeld' : 'Nog niet gekoppeld'}</strong>
        <button className="btn small" onClick={koppel}>{status ? 'Opnieuw koppelen' : 'Koppel Frame.io'}</button>
      </div>
    </div>
  )
}
