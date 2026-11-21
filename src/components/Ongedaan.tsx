// Kleine melding onderin met "Ongedaan maken", na het verwijderen van een notitie of update.
import { useEffect, useState } from 'react'

type Melding = { id: number; tekst: string; herstel: () => void }
const luisteraars = new Set<(m: Melding) => void>()
let teller = 0

/** Toon "… verwijderd · Ongedaan maken" (8 seconden). */
export function metOngedaan(tekst: string, herstel: () => void) {
  const m = { id: ++teller, tekst, herstel }
  luisteraars.forEach((f) => f(m))
}

export function OngedaanMelding() {
  const [m, setM] = useState<Melding | null>(null)
  useEffect(() => {
    const f = (n: Melding) => setM(n)
    luisteraars.add(f)
    return () => { luisteraars.delete(f) }
  }, [])
  useEffect(() => {
    if (!m) return
    const t = setTimeout(() => setM((x) => (x?.id === m.id ? null : x)), 8000)
    return () => clearTimeout(t)
  }, [m])
  if (!m) return null
  return (
    <div className="ongedaan" role="status">
      <span>{m.tekst}</span>
      <button onClick={() => { m.herstel(); setM(null) }}>Ongedaan maken</button>
    </div>
  )
}
