import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TEAM } from '../data/mock'
import type { PersonId, Priority, TaskStatus } from '../data/types'

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  crm: 'M16 11a4 4 0 1 0-8 0M12 15c-4 0-7 2-7 5h14c0-3-3-5-7-5zM19 8a3 3 0 0 1 0 6M5 8a3 3 0 0 0 0 6',
  clients: 'M3 7h18v13H3zM8 7V4h8v3M3 12h18',
  portal: 'M3 5h18v14H3zM3 9h18M7 7h.01M10 7h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  chat: 'M4 5h16v11H8l-4 4z',
  note: 'M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h5',
  phone: 'M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  external: 'M14 4h6v6M20 4 10 14M18 14v6H4V6h6',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  check: 'M5 12l5 5L20 7',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  list: 'M4 6h16M4 12h16M4 18h16',
  board: 'M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v13h-4z',
  play: 'M7 4v16l13-8z',
  refresh: 'M4 4v6h6M20 20v-6h-6M5 15a8 8 0 0 0 14 2M19 9A8 8 0 0 0 5 7',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  clip: 'M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
}

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}

export function Avatar({ id, size = 26 }: { id: PersonId; size?: number }) {
  const p = TEAM.find((t) => t.id === id) ?? { id, name: id, role: '', initials: id.slice(0, 2).toUpperCase(), color: '#8895A8' }
  if (p.photo)
    return <img className="avatar avatar-photo" src={p.photo} alt={p.name} title={`${p.name} · ${p.role}`} style={{ width: size, height: size }} />
  return (
    <span className="avatar" title={`${p.name} · ${p.role}`} style={{ width: size, height: size, background: p.color, fontSize: size * 0.38 }}>
      {p.initials}
    </span>
  )
}

/** Profielfoto bij een taak, alleen als expliciet is aangevinkt dat de taak van één persoon is. */
export function TaakWie({ t, size }: { t: { assignee: PersonId; alleenVoor?: boolean }; size?: number }) {
  return t.alleenVoor ? <Avatar id={t.assignee} size={size} /> : null
}

export const personName = (id: PersonId) => TEAM.find((t) => t.id === id)?.name ?? id

const PRIO: Record<Priority, string> = { hoog: 'Hoog', middel: 'Middel', laag: 'Laag' }
export function PriorityBadge({ p }: { p: Priority }) {
  return <span className={`badge prio-${p}`}>{PRIO[p]}</span>
}

export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Te doen', bezig: 'Bezig', review: 'Ter review', klaar: 'Klaar' }
export function StatusBadge({ s }: { s: TaskStatus }) {
  return <span className={`badge status-${s}`}>{STATUS_LABEL[s]}</span>
}

export function Drawer({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  if (!open) return null
  // Direct in <body>: een glazen kaart (backdrop-filter) zou het venster anders binnen die kaart opsluiten
  return createPortal(
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className={`drawer ${wide ? 'wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div className="drawer-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Sluiten">
            <Icon name="x" />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  )
}

/** Telt het getal in een tekst op van 0 naar de waarde (eenmalig, ~0,7 s). Laat de tekst staan als iemand minder beweging wil. */
export function Optellen({ tekst }: { tekst: string }) {
  const m = tekst.match(/^(\D*?)([\d.]+(?:,\d+)?)(.*)$/)
  const doel = m ? Number(m[2].replace(/\./g, '').replace(',', '.')) : NaN
  const [n, setN] = useState(0)
  const rustig = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (!m || !isFinite(doel) || rustig) return
    let raf = 0
    const start = performance.now()
    const stap = (t: number) => {
      const p = Math.min(1, (t - start) / 700)
      setN(doel * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(stap)
    }
    raf = requestAnimationFrame(stap)
    return () => cancelAnimationFrame(raf)
  }, [tekst])
  if (!m || !isFinite(doel) || rustig) return <>{tekst}</>
  const decimalen = m[2].includes(',') ? m[2].split(',')[1].length : 0
  return <>{m[1]}{n.toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen })}{m[3]}</>
}

/** Grijs, zacht pulserend vlak op de plek waar straks iets komt. */
export function Skelet({ w = '100%', h = 14, r = 6 }: { w?: number | string; h?: number; r?: number }) {
  return <span className="skelet" style={{ width: w, height: h, borderRadius: r }} aria-hidden />
}

/** Een paar skeletregels, bijv. voor een lijst of een blok cijfers dat nog laadt. */
export function SkeletRegels({ n = 3 }: { n?: number }) {
  return (
    <div className="skelet-regels" role="status" aria-label="Laden">
      {Array.from({ length: n }, (_, i) => <Skelet key={i} w={`${[92, 74, 58, 80][i % 4]}%`} h={12} />)}
    </div>
  )
}

/** Lege staat: icoon, één zin, eventueel een knop. Een uitnodiging, geen excuus. */
export function LeegStaat({ icon = 'list', titel, tekst, actie }: { icon?: string; titel: string; tekst?: string; actie?: { label: string; onClick: () => void } }) {
  return (
    <div className="leeg-staat">
      <span className="leeg-icoon"><Icon name={icon} size={18} /></span>
      <strong>{titel}</strong>
      {tekst && <span className="muted small">{tekst}</span>}
      {actie && <button className="btn small" onClick={actie.onClick}><Icon name="plus" size={13} /> {actie.label}</button>}
    </div>
  )
}

/** Klein trendlijntje (bijv. per week). Groen als de laatste waarde hoger is dan de eerste, anders grijs. */
export function Sparkline({ waarden, w = 96, h = 32 }: { waarden: number[]; w?: number; h?: number }) {
  if (waarden.length < 2) return null
  const max = Math.max(...waarden, 1)
  const stap = w / (waarden.length - 1)
  const pt = waarden.map((v, i) => [i * stap, h - 3 - (v / max) * (h - 6)] as const)
  const kleur = waarden[waarden.length - 1] >= waarden[0] ? 'var(--green)' : 'var(--muted)'
  const [lx, ly] = pt[pt.length - 1]
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pt.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke={kleur} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3} fill={kleur} />
    </svg>
  )
}

export function Kpi({ label, value, delta, hint, trend, deltaTekst = 't.o.v. vorige maand' }: { label: string; value: string; delta?: number; hint?: string; trend?: number[]; deltaTekst?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-rij">
        <div className="kpi-value"><Optellen tekst={value} /></div>
        {trend && <Sparkline waarden={trend} />}
      </div>
      {delta !== undefined && isFinite(delta) && (
        <div className={`kpi-delta ${delta >= 0 ? 'up' : 'down'}`}>
          <span className={`trend-pil ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '+' : '−'}{Math.abs(delta)}%</span> <span className="muted">{deltaTekst}</span>
        </div>
      )}
      {hint && <div className="muted small">{hint}</div>}
    </div>
  )
}

/** Mentions (@Lars) visueel markeren in commentaar. */
export function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@\w+)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('@') && TEAM.some((t) => t.name.toLowerCase() === p.slice(1).toLowerCase()) ? (
          <span key={i} className="mention">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function DemoNote({ children }: { children: ReactNode }) {
  return <div className="demo-note">{children}</div>
}
