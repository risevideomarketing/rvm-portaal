import { useRef, useState } from 'react'
import { grootteTekst, MAX_MB, openLink, uploaden, weghalen } from '../bestanden'
import type { Bestand } from '../data/types'
import { useMag, useStore } from '../store'
import { fmtDateTime } from '../utils'
import { Icon, personName } from './ui'

/** Lijst met bestanden plus uploadknop. Slepen op het blok werkt ook. Alleen voor het team. */
export function Bestanden({ map, lijst, onChange, leeg = 'Nog geen bestanden.' }: { map: string; lijst: Bestand[]; onChange: (lijst: Bestand[]) => void; leeg?: string }) {
  const { s } = useStore()
  const kan = useMag()
  const ref = useRef<HTMLInputElement>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [over, setOver] = useState(false)

  const voegToe = async (files: FileList | null) => {
    if (!files?.length) return
    setBezig(true)
    setFout('')
    const nieuw: Bestand[] = []
    for (const f of Array.from(files)) {
      const r = await uploaden(map, f, s.me)
      if (r.bestand) nieuw.push(r.bestand)
      else if (r.fout) setFout(r.fout)
    }
    setBezig(false)
    if (nieuw.length) onChange([...nieuw, ...lijst])
  }

  const open = async (b: Bestand) => {
    const url = await openLink(b)
    if (!url) return setFout('Openen lukte niet. Probeer het opnieuw.')
    if (url.startsWith('data:')) {
      const a = document.createElement('a')
      a.href = url
      a.download = b.naam
      a.click()
    } else window.open(url, '_blank', 'noopener')
  }

  const weg = async (b: Bestand) => {
    if (!window.confirm(`${b.naam} verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return
    await weghalen(b)
    onChange(lijst.filter((x) => x.id !== b.id))
  }

  return (
    <div className={`bestanden ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); voegToe(e.dataTransfer.files) }}>
      {lijst.length === 0 && <p className="muted small" style={{ margin: '0 0 8px' }}>{leeg}</p>}
      <ul className="bestand-lijst">
        {lijst.map((b) => (
          <li key={b.id}>
            <button className="bestand-naam" onClick={() => open(b)} title="Openen">
              <Icon name={b.type.startsWith('image/') ? 'image' : 'clip'} size={14} />
              <span>{b.naam}</span>
            </button>
            <span className="muted small">{grootteTekst(b.grootte)} · {b.by ? `${personName(b.by)} · ` : ''}{fmtDateTime(b.at).split(',')[0]}</span>
            {kan('verwijderen') && <button className="icon-btn" onClick={() => weg(b)} aria-label={`${b.naam} verwijderen`}><Icon name="trash" size={14} /></button>}
          </li>
        ))}
      </ul>
      <input ref={ref} type="file" multiple hidden onChange={(e) => { voegToe(e.target.files); e.target.value = '' }} />
      <button className="btn small" onClick={() => ref.current?.click()} disabled={bezig}>
        <Icon name="upload" size={14} /> {bezig ? 'Uploaden…' : 'Bestand uploaden'}
      </button>
      <span className="muted small" style={{ marginLeft: 10 }}>Of sleep het hierheen. Max {MAX_MB} MB per bestand.</span>
      {fout && <p className="small danger-tekst" style={{ margin: '8px 0 0' }}>{fout}</p>}
    </div>
  )
}
