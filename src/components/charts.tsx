import { euro } from '../utils'

interface Series {
  label: string
  color: string
  values: number[]
}

/** Gegroepeerde staafgrafiek, puur SVG. */
export function BarChart({ labels, series, height = 240, money = true }: { labels: string[]; series: Series[]; height?: number; money?: boolean }) {
  const W = 640
  const H = height
  const pad = { l: 56, r: 12, t: 12, b: 28 }
  const max = Math.max(...series.flatMap((s) => s.values)) * 1.1
  const step = (W - pad.l - pad.r) / labels.length
  const bw = Math.min(26, (step * 0.7) / series.length)
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="axis">
            {money ? `€${Math.round(t / 1000)}k` : Math.round(t)}
          </text>
        </g>
      ))}
      {labels.map((l, i) => {
        const cx = pad.l + step * i + step / 2
        return (
          <g key={l}>
            {series.map((s, j) => {
              const x = cx - (bw * series.length) / 2 + j * bw + 1
              const v = s.values[i]
              return (
                <rect key={s.label} x={x} y={y(v)} width={bw - 2} height={H - pad.b - y(v)} rx={3} fill={s.color}>
                  <title>{`${s.label} ${l}: ${money ? euro(v) : v}`}</title>
                </rect>
              )
            })}
            <text x={cx} y={H - 8} textAnchor="middle" className="axis">
              {l}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Lijngrafiek met vlak eronder. */
export function LineChart({ labels, values, color = '#08111F', height = 200 }: { labels: string[]; values: number[]; color?: string; height?: number }) {
  const W = 640
  const H = height
  const pad = { l: 36, r: 16, t: 16, b: 28 }
  const max = Math.max(...values) * 1.2
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) / (labels.length - 1)) * i
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  const area = `${line} L${x(values.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="grid" />
      <path d={area} fill={color} opacity={0.08} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={4} fill="#fff" stroke={color} strokeWidth={2} />
          <text x={x(i)} y={y(v) - 10} textAnchor="middle" className="axis strong">
            {v}
          </text>
          <text x={x(i)} y={H - 8} textAnchor="middle" className="axis">
            {labels[i]}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function Progress({ value, max }: { value: number; max: number }) {
  return (
    <div className="progress">
      <div style={{ width: `${(value / max) * 100}%` }} />
    </div>
  )
}
