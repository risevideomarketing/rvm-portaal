import { useEffect, useState } from 'react'
import { mijnKlanten, wisselKlant } from '../slack'

/** Keuzelijst in het portaal als iemand bij meer dan één organisatie hoort. */
export function KlantWissel({ actief }: { actief: string }) {
  const [klanten, setKlanten] = useState<{ id: string; naam: string }[]>([])
  const [bezig, setBezig] = useState(false)
  useEffect(() => { mijnKlanten().then((r) => setKlanten(r?.klanten ?? [])) }, [])
  if (klanten.length < 2) return null
  return (
    <select className="portal-wissel" value={actief} disabled={bezig} aria-label="Kies organisatie"
      onChange={async (e) => { setBezig(true); if (await wisselKlant(e.target.value)) location.reload(); else setBezig(false) }}>
      {klanten.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}
    </select>
  )
}
