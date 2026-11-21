// Kennisbank-artikelen zoals ze in Notion stonden: koppen, lijsten, callouts, kolommen, toggles, tabbladen, tabellen en afbeeldingen.
// Leest het Notion-markdown (zoals de Notion-export het geeft) en tekent het in Rise-stijl. Alleen bekende opmaak wordt omgezet; de rest is tekst.
import { Fragment, useState, type ReactNode } from 'react'
import { useKennisAfbeelding } from '../kennis'

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c])

/** Inline-opmaak naar veilige html: alleen b, i, u, s, code, br, span met kleur en links. */
function inline(tekst: string): string {
  let h = esc(tekst.replace(/\\([|*_[\]])/g, '$1'))
  h = h.replace(/&lt;(\/?)(b|i|u|s|code|strong|em)&gt;/g, '<$1$2>')
  h = h.replace(/&lt;br\s*\/?&gt;/g, '<br>')
  h = h.replace(/&lt;span color=&quot;([a-z_]+)&quot;&gt;/g, '<span class="n-kleur n-$1">').replace(/&lt;\/span&gt;/g, '</span>')
  h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noreferrer">${t}</a>`)
  // Losse lege tags opruimen
  return h.replace(/&lt;\/?(p|li|ol|ul)\s*\/?&gt;/g, '')
}
const Inline = ({ t }: { t: string }) => <span dangerouslySetInnerHTML={{ __html: inline(t) }} />

const BLOK = ['tabs', 'tab', 'columns', 'column', 'callout', 'toggle', 'table', 'h1', 'h2', 'h3', 'ol', 'ul', 'li', 'p', 'colgroup']
const attr = (kop: string, naam: string) => kop.match(new RegExp(`${naam}="([^"]*)"`))?.[1]

/** Splitst regels op in blokken; een XML-blok loopt tot zijn eigen sluittag (genest meegeteld). */
function blokken(regels: string[]): { tag?: string; kop?: string; regels: string[] }[] {
  const uit: { tag?: string; kop?: string; regels: string[] }[] = []
  let i = 0
  while (i < regels.length) {
    const r = regels[i].trim()
    const m = r.match(/^<([a-z0-9]+)(\s[^>]*)?>(.*)$/)
    if (m && BLOK.includes(m[1]) && !r.endsWith('/>')) {
      const tag = m[1]
      // Alles op één regel, bijv. <page url="…">Titel</page> of <tr><td>…</td></tr>
      if (new RegExp(`</${tag}>$`).test(r) && (r.match(new RegExp(`<${tag}[\\s>]`, 'g'))?.length ?? 0) === 1) {
        uit.push({ tag, kop: m[2] ?? '', regels: [r.replace(new RegExp(`^<${tag}[^>]*>`), '').replace(new RegExp(`</${tag}>$`), '')] })
        i++; continue
      }
      let diepte = 1
      const binnen: string[] = []
      if (m[3]) binnen.push(m[3])
      i++
      while (i < regels.length) {
        const x = regels[i].trim()
        if (new RegExp(`^<${tag}(\\s[^>]*)?>`).test(x) && !x.endsWith('/>') && !new RegExp(`</${tag}>$`).test(x)) diepte++
        if (new RegExp(`</${tag}>$`).test(x)) { diepte--; if (diepte === 0) { const rest = x.replace(new RegExp(`</${tag}>$`), ''); if (rest) binnen.push(rest); i++; break } }
        binnen.push(regels[i])
        i++
      }
      uit.push({ tag, kop: m[2] ?? '', regels: binnen })
      continue
    }
    uit.push({ regels: [regels[i]] })
    i++
  }
  return uit
}

/** Markdown-lijsten (ook genest) en losse regels. */
function Tekst({ regels, afb }: { regels: string[]; afb?: Record<string, string> }) {
  const delen: ReactNode[] = []
  let i = 0
  const lijst = (start: number, inspring: number): [ReactNode, number] => {
    const items: { t: string; kinderen: ReactNode | null; vink?: boolean }[] = []
    const genummerd = /^\s*\d+\.\s/.test(regels[start])
    let j = start
    while (j < regels.length) {
      const r = regels[j]
      const ins = r.match(/^\s*/)![0].length
      const m = r.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/)
      if (!m || ins < inspring) break
      if (ins > inspring) { const [kind, k] = lijst(j, ins); if (items.length) items[items.length - 1].kinderen = kind; j = k; continue }
      const vink = m[1].match(/^\[( |x)\]\s*(.*)$/)
      items.push({ t: vink ? vink[2] : m[1], kinderen: null, vink: vink ? vink[1] === 'x' : undefined })
      j++
      // Vervolgregels (ingesprongen tekst zonder opsommingsteken) horen bij het laatste item
      while (j < regels.length && regels[j].trim() && !/^\s*(?:[-•*]|\d+\.)\s/.test(regels[j]) && regels[j].match(/^\s*/)![0].length > inspring) { items[items.length - 1].t += `<br>${regels[j].trim()}`; j++ }
    }
    const Lijst = genummerd ? 'ol' : 'ul'
    return [<Lijst key={start} className="n-lijst">{items.map((x, k) => <li key={k} className={x.vink !== undefined ? 'n-vink' : ''}>{x.vink !== undefined && <input type="checkbox" checked={x.vink} readOnly />}<Inline t={x.t} />{x.kinderen}</li>)}</Lijst>, j]
  }
  while (i < regels.length) {
    const r = regels[i]
    const t = r.trim()
    if (!t || t === '<p />' || t === '<br />' || t === '<embed />') { i++; continue }
    if (/^\s*(?:[-•*]|\d+\.)\s/.test(r)) { const [el, j] = lijst(i, r.match(/^\s*/)![0].length); delen.push(el); i = j; continue }
    const kop = t.match(/^(#{1,3})\s+(.*)$/)
    if (kop) { const H = (['h2', 'h3', 'h4'] as const)[kop[1].length - 1]; delen.push(<H key={i} className="n-kop"><Inline t={kop[2]} /></H>); i++; continue }
    if (t === '---') { delen.push(<hr key={i} className="n-lijn" />); i++; continue }
    if (t.startsWith('>')) { delen.push(<blockquote key={i} className="n-citaat"><Inline t={t.replace(/^>\s?/, '')} /></blockquote>); i++; continue }
    const beeld = t.match(/^<image source="([^"]+)"\s*\/>$/) ?? t.match(/^!\[[^\]]*\]\(([^)]+)\)$/)
    if (beeld) { delen.push(<Beeld key={i} bron={beeld[1]} afb={afb} />); i++; continue }
    const pdf = t.match(/^<pdf source="([^"]+)"\s*\/>$/)
    if (pdf) { delen.push(<div key={i} className="n-bestand">📄 {decodeURIComponent(pdf[1].match(/name=([^&]+)/)?.[1] ?? 'Pdf')}</div>); i++; continue }
    delen.push(<p key={i} className="n-p"><Inline t={t} /></p>)
    i++
  }
  return <>{delen}</>
}

function Beeld({ bron, afb }: { bron: string; afb?: Record<string, string> }) {
  const naam = decodeURIComponent(bron.match(/name=([^&]+)/)?.[1] ?? '')
  const pad = bron.startsWith('http') ? bron : afb?.[naam]
  const url = useKennisAfbeelding(pad && !pad.startsWith('http') ? pad : undefined)
  const src = pad?.startsWith('http') ? pad : url
  return src ? <img className="n-beeld" src={src} alt={naam} loading="lazy" /> : <div className="n-beeld leeg">Afbeelding: {naam || 'uit Notion'}</div>
}

function Tabs({ tabs, afb }: { tabs: { kop: string; regels: string[] }[]; afb?: Record<string, string> }) {
  const [open, setOpen] = useState(0)
  const zichtbaar = tabs.filter((t) => t.regels.some((r) => r.trim()))
  const huidig = zichtbaar[open]
  return (
    <div className="n-tabs">
      <div className="n-tabkop" role="tablist">
        {zichtbaar.map((t, k) => (
          <button key={k} role="tab" className={k === open ? 'on' : ''} onClick={() => setOpen(k)}>{attr(t.kop, 'icon') ? `${attr(t.kop, 'icon')} ` : ''}{t.regels.find((r) => r.trim())?.trim()}</button>
        ))}
      </div>
      {huidig && <div className="n-tabinhoud"><Blokken regels={huidig.regels.slice(huidig.regels.findIndex((r) => r.trim()) + 1)} afb={afb} /></div>}
    </div>
  )
}

function Toggle({ kop, regels, afb }: { kop: string; regels: string[]; afb?: Record<string, string> }) {
  const eerste = regels.findIndex((r) => r.trim())
  const titel = regels[eerste]?.trim() ?? ''
  const rest = regels.slice(eerste + 1)
  const groot = attr(kop, 'heading')
  if (!rest.some((r) => r.trim() && r.trim() !== '<p />')) return <div className={`n-toggle leeg ${groot ? 'n-groot' : ''}`}><Inline t={titel} /></div>
  return (
    <details className={`n-toggle ${groot ? 'n-groot' : ''}`}>
      <summary><Inline t={titel} /></summary>
      <div className="n-toggle-inhoud"><Blokken regels={rest} afb={afb} /></div>
    </details>
  )
}

function Tabel({ regels }: { regels: string[] }) {
  const html = regels.join('')
  const rijen = [...html.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => [...m[1].matchAll(/<td>(.*?)<\/td>/gs)].map((c) => c[1].trim()))
    .filter((r) => r.some(Boolean))
  return (
    <div className="n-tabel"><table><tbody>{rijen.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}><Inline t={c} /></td>)}</tr>)}</tbody></table></div>
  )
}

export function Blokken({ regels, afb }: { regels: string[]; afb?: Record<string, string> }) {
  const lijst = blokken(regels)
  const uit: ReactNode[] = []
  let tekst: string[] = []
  const spoel = (k: number) => { if (tekst.length) { uit.push(<Tekst key={`t${k}`} regels={tekst} afb={afb} />); tekst = [] } }
  lijst.forEach((b, k) => {
    if (!b.tag) { tekst.push(b.regels[0]); return }
    spoel(k)
    const kop = b.kop ?? ''
    switch (b.tag) {
      case 'columns': {
        const kolommen = blokken(b.regels).filter((x) => x.tag === 'column')
        uit.push(<div key={k} className="n-kolommen" style={{ gridTemplateColumns: kolommen.map((c) => `minmax(0, ${Number(attr(c.kop ?? '', 'ratio')) || 1}fr)`).join(' ') }}>{kolommen.map((c, j) => <div key={j} className="n-kolom"><Blokken regels={c.regels} afb={afb} /></div>)}</div>)
        break
      }
      case 'callout':
        uit.push(<div key={k} className={`n-callout n-${attr(kop, 'color') ?? 'gray_bg'}`}>{attr(kop, 'icon') && <span className="n-callout-icoon">{attr(kop, 'icon')}</span>}<div><Blokken regels={b.regels} afb={afb} /></div></div>)
        break
      case 'toggle':
        uit.push(<Toggle key={k} kop={kop} regels={b.regels} afb={afb} />)
        break
      case 'tabs':
        uit.push(<Tabs key={k} tabs={blokken(b.regels).filter((x) => x.tag === 'tab').map((x) => ({ kop: x.kop ?? '', regels: x.regels }))} afb={afb} />)
        break
      case 'table':
        uit.push(<Tabel key={k} regels={b.regels} />)
        break
      case 'h1': case 'h2': case 'h3': {
        const H = ({ h1: 'h2', h2: 'h3', h3: 'h4' } as const)[b.tag]
        uit.push(<H key={k} className="n-kop"><Inline t={b.regels.join(' ').trim()} /></H>)
        break
      }
      case 'ul': case 'ol': {
        const items = blokken(b.regels).filter((x) => x.tag === 'li').map((x) => x.regels.join(' ').trim())
        const L = b.tag
        uit.push(<L key={k} className="n-lijst">{items.map((t, j) => (t ? <li key={j}><Inline t={t} /></li> : null))}</L>)
        break
      }
      default:
        uit.push(<Fragment key={k}><Blokken regels={b.regels} afb={afb} /></Fragment>)
    }
  })
  spoel(lijst.length)
  // Subpagina-links: <page url="…">Titel</page>
  return <>{uit.map((x, k) => <Fragment key={k}>{x}</Fragment>)}</>
}

/** Volledig artikel in Notion-opmaak. */
export function NotionInhoud({ md, afb }: { md: string; afb?: Record<string, string> }) {
  const regels = md.replace(/<page url="([^"]+)">\s*([^<]*?)\s*<\/page>/g, '[📄 $2]($1)').split('\n')
  return <div className="notion-inhoud"><Blokken regels={regels} afb={afb} /></div>
}
