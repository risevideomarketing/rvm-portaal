import { useState } from 'react'
import { Avatar, Icon, PageHead, personName } from '../components/ui'
import { useArtikelen, useKennisAfbeelding } from '../kennis'
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

  if (article?.notion)
    return (
      <>
        <button className="back" onClick={() => go('kennisbank')}>← Kennisbank</button>
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
        <button className="back" onClick={() => go('kennisbank')}>← Kennisbank</button>
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
      <PageHead title="Kennisbank" sub="Alles uit Notion (Rise | Intern en Rise | Resources) plus onze SOP's. Met het label klant staat het ook in het klantportaal." />
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
