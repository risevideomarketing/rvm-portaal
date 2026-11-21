import { useState } from 'react'
import { Avatar, Icon, PageHead, personName } from '../components/ui'
import { bewaarArtikel, useArtikelen, useKennisAfbeelding, verwijderArtikel } from '../kennis'
import { metOngedaan } from '../components/Ongedaan'
import { useStore } from '../store'
import type { Article } from '../data/types'
import { fmtDate } from '../utils'
import { NotionInhoud } from '../components/NotionInhoud'

/** Zet een youtu.be/… of youtube.com/watch?v=… link om naar een embed-URL. */
function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

export function Kennisbank({ id, go }: { id?: string; go: (r: string) => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('Alles')
  const ARTICLES = useArtikelen()
  const article = ARTICLES.find((a) => a.id === id)
  const cats = ['Alles', ...Array.from(new Set(ARTICLES.map((a) => a.groep ?? a.category))), 'Voor klanten']
  const [bewerk, setBewerk] = useState<Article | null>(null)

  if (bewerk)
    return <ArtikelBewerken artikel={bewerk} groepen={cats.filter((c) => c !== 'Alles' && c !== 'Voor klanten')} onKlaar={(a) => { setBewerk(null); if (a) go(`kennisbank/${a.id}`) }} onWeg={() => { setBewerk(null); go('kennisbank') }} />

  if (article?.notion)
    return (
      <>
        <div className="kb-kop"><button className="back" onClick={() => go('kennisbank')}>← Kennisbank</button><button className="btn small" onClick={() => setBewerk(article)}><Icon name="note" size={14} /> Bewerken</button></div>
        <article className="card article notion-artikel">
          <div className="article-meta"><span className="muted small">{article.groep ?? article.category}</span>{article.klant && <span className="badge status-klaar">ook voor klanten</span>}</div>
          <h1>{article.icoon ? `${article.icoon} ` : ''}{article.title}</h1>
          <NotionInhoud md={article.notion} afb={article.afbeeldingen} />
        </article>
      </>
    )

  if (article)
    return (
      <>
        <div className="kb-kop"><button className="back" onClick={() => go('kennisbank')}>← Kennisbank</button><button className="btn small" onClick={() => setBewerk(article)}><Icon name="note" size={14} /> Bewerken</button></div>
        <article className="card article">
          <div className="article-meta">
            <span className={`badge ${article.type === 'SOP' ? 'type-sop' : 'type-kennis'}`}>{article.type}</span>
            <span className="muted small">{article.category}</span>
          </div>
          <h1>{article.title}</h1>
          <p className="lead">{article.summary}</p>
          {article.videoUrl && youtubeEmbed(article.videoUrl) && (
            <div className="article-video">
              <iframe src={youtubeEmbed(article.videoUrl)!} title={article.title} allowFullScreen />
            </div>
          )}
          {article.steps && (
            <>
              <h3 className="section-title">Stappen</h3>
              <ol className="sop-steps">
                {article.steps.map((st, i) => (
                  <li key={i}><span className="step-n">{i + 1}</span>{st}</li>
                ))}
              </ol>
            </>
          )}
          {article.body.map((p, i) => <p key={i}>{p}</p>)}
          {article.images?.map((img) => <KennisAfbeelding key={img.src} src={img.src} alt={img.alt} />)}
          <div className="article-foot muted small">
            <Avatar id={article.author} size={20} /> Bijgewerkt door {personName(article.author)} op {fmtDate(article.updated)}
          </div>
        </article>
      </>
    )

  const ql = q.toLowerCase()
  const list = ARTICLES.filter((a) => (cat === 'Alles' || (cat === 'Voor klanten' ? a.klant : (a.groep ?? a.category) === cat)) && (a.title + a.summary + a.body.join(' ') + (a.steps ?? []).join(' ') + (a.notion ?? '')).toLowerCase().includes(ql))

  return (
    <>
      <PageHead title="Kennisbank" sub="Alles uit Notion (Rise | Intern en Rise | Resources) plus onze SOP's. Met het label klant staat het ook in het klantportaal.">
        <button className="btn primary" onClick={() => setBewerk({ id: `kb-${Date.now().toString(36)}`, title: '', category: 'Kennis', groep: cat !== 'Alles' && cat !== 'Voor klanten' ? cat : 'Rise | Intern', type: 'Kennis', updated: new Date().toISOString().slice(0, 10), author: 'daan', summary: '', body: [], notion: '', klant: cat === 'Voor klanten' })}><Icon name="plus" size={16} /> Artikel</button>
      </PageHead>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input placeholder="Zoek in alle SOP's en kennis…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips">
          {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      </div>
      <div className="article-grid">
        {list.map((a) => (
          <button key={a.id} className="card article-card" onClick={() => go(`kennisbank/${a.id}`)}>
            <div className="article-meta">
              <span className={`badge ${a.type === 'SOP' ? 'type-sop' : 'type-kennis'}`}>{a.type}</span>
              <span className="muted small">{a.groep ?? a.category}</span>
              {a.klant && <span className="badge status-klaar">klant</span>}
            </div>
            <strong>{a.icoon ? `${a.icoon} ` : ''}{a.title}</strong>
            <p className="muted small">{a.summary}</p>
            <div className="muted small article-card-foot">{a.steps ? `${a.steps.length} stappen · ` : ''}bijgewerkt {fmtDate(a.updated)}</div>
          </button>
        ))}
        {list.length === 0 && <p className="muted">Niets gevonden voor "{q}".</p>}
      </div>
    </>
  )
}

function KennisAfbeelding({ src, alt }: { src: string; alt: string }) {
  const url = useKennisAfbeelding(src)
  return (
    <figure className="article-img">
      {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={alt} loading="lazy" /></a> : <div className="muted small">Afbeelding laden…</div>}
      <figcaption className="muted small">{alt}</figcaption>
    </figure>
  )
}

/** Oud artikel (tekst + stappen) omzetten naar opmaaktekst, zodat alles op één manier bewerkt wordt. */
function naarTekst(a: Article): string {
  if (a.notion !== undefined && a.notion !== '') return a.notion
  const delen: string[] = []
  if (a.body?.length) delen.push(a.body.join('\n\n'))
  if (a.steps?.length) delen.push(a.steps.map((x, i) => `${i + 1}. ${x}`).join('\n'))
  return delen.join('\n\n')
}

function ArtikelBewerken({ artikel, groepen, onKlaar, onWeg }: { artikel: Article; groepen: string[]; onKlaar: (a?: Article) => void; onWeg: () => void }) {
  const { s } = useStore()
  const [a, setA] = useState<Article>({ ...artikel, notion: naarTekst(artikel) })
  const [fout, setFout] = useState('')
  const [voorbeeld, setVoorbeeld] = useState(false)
  const bestaat = Boolean(artikel.title)
  const zet = (p: Partial<Article>) => setA((x) => ({ ...x, ...p }))
  const opslaan = async () => {
    if (!a.title.trim()) return setFout('Geef het artikel een titel.')
    const klaar: Article = { ...a, title: a.title.trim(), category: a.groep ?? a.category, updated: new Date().toISOString().slice(0, 10), body: [], steps: undefined, klanten: a.klant ? a.klanten ?? [] : [] }
    const f = await bewaarArtikel(klaar)
    if (f) return setFout(f)
    onKlaar(klaar)
  }
  const weg = async () => {
    const oud = artikel
    const f = await verwijderArtikel(oud.id)
    if (f) return setFout(f)
    metOngedaan('Artikel verwijderd', () => { bewaarArtikel(oud) })
    onWeg()
  }
  const toggleKlant = (id: string) => zet({ klanten: (a.klanten ?? []).includes(id) ? (a.klanten ?? []).filter((x) => x !== id) : [...(a.klanten ?? []), id] })
  return (
    <>
      <button className="back" onClick={() => onKlaar()}>← Terug</button>
      <div className="card kb-bewerk">
        <div className="kb-rij"><input className="kb-icoon" value={a.icoon ?? ''} placeholder="📄" maxLength={4} onChange={(e) => zet({ icoon: e.target.value })} /><input className="kb-titel" autoFocus={!bestaat} placeholder="Titel" value={a.title} onChange={(e) => zet({ title: e.target.value })} /></div>
        <div className="kb-velden">
          <label><span className="muted small">Map</span><input list="kb-groepen" value={a.groep ?? ''} onChange={(e) => zet({ groep: e.target.value })} /><datalist id="kb-groepen">{groepen.map((g) => <option key={g} value={g} />)}</datalist></label>
          <label><span className="muted small">Korte omschrijving</span><input value={a.summary} onChange={(e) => zet({ summary: e.target.value })} /></label>
        </div>
        <div className="kb-inhoud-kop"><span className="muted small">Inhoud: # kop, - opsomming, 1. stappen, **vet**, &lt;toggle&gt;, &lt;callout&gt;, &lt;columns&gt; zoals in Notion</span><button className="link small" onClick={() => setVoorbeeld(!voorbeeld)}>{voorbeeld ? 'Bewerken' : 'Voorbeeld'}</button></div>
        {voorbeeld ? <div className="kb-voorbeeld"><NotionInhoud md={a.notion ?? ''} afb={a.afbeeldingen} /></div> : <textarea className="kb-tekst" rows={18} value={a.notion ?? ''} onChange={(e) => zet({ notion: e.target.value })} />}
        <div className="kb-klant">
          <label className="kb-schakel"><input type="checkbox" checked={Boolean(a.klant)} onChange={(e) => zet({ klant: e.target.checked })} /> Tonen in het klantportaal</label>
          {a.klant && (
            <div className="kb-klanten">
              <span className="muted small">{(a.klanten ?? []).length ? 'Alleen voor:' : 'Voor alle klanten. Of kies specifieke klanten:'}</span>
              <div className="chips">{s.clients.map((c) => <button key={c.id} className={`chip ${(a.klanten ?? []).includes(c.id) ? 'on' : ''}`} onClick={() => toggleKlant(c.id)}>{c.name}</button>)}</div>
            </div>
          )}
        </div>
        {fout && <p className="small" style={{ color: '#c0392b' }}>{fout}</p>}
        <div className="kb-knoppen">
          <button className="btn primary" onClick={opslaan}>Opslaan</button>
          <button className="btn ghost" onClick={() => onKlaar()}>Annuleren</button>
          {bestaat && <button className="btn ghost kb-weg" onClick={weg}><Icon name="x" size={14} /> Verwijderen</button>}
        </div>
      </div>
    </>
  )
}
