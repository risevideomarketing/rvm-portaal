import { useRef, useState } from 'react'
import type { Contact } from '../data/types'
import { Icon } from './ui'

type Merk = Pick<Contact, 'logo' | 'website'>

/** Kale domeinnaam uit wat iemand in het websiteveld plakt. */
export const domeinVan = (website?: string) =>
  (website ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0]

/** Logo van een bedrijf: eigen upload, anders het icoon van de website (via Google, 128px). */
export function logoSrc(merk?: Merk): string {
  if (merk?.logo) return merk.logo
  const d = domeinVan(merk?.website)
  return d.includes('.') ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128` : ''
}

const initialen = (naam: string) =>
  naam.replace(/[^\p{L}\p{N}\s&]/gu, ' ').split(/\s+/).filter((w) => w && w !== '&').slice(0, 2).map((w) => w[0]).join('').toUpperCase()

/** Klein logo in een vierkantje. Geen logo (of alleen Googles standaardwereldbol van 16px): de initialen. */
export function MerkLogo({ merk, naam, size = 36 }: { merk?: Merk; naam: string; size?: number }) {
  const src = logoSrc(merk)
  const [kapot, setKapot] = useState(false)
  return (
    <span className="merk-logo" style={{ width: size, height: size, borderRadius: Math.round(size / 4.5) }} aria-hidden>
      {src && !kapot ? (
        <img key={src} src={src} alt="" onError={() => setKapot(true)} onLoad={(e) => !merk?.logo && e.currentTarget.naturalWidth <= 16 && setKapot(true)} />
      ) : (
        <b style={{ fontSize: Math.round(size * 0.38) }}>{initialen(naam)}</b>
      )}
    </span>
  )
}

/** Logo verkleinen tot max. 256px (png, transparantie blijft), zodat het klein in de database staat. */
function verklein(file: File): Promise<string> {
  return new Promise((ok, fout) => {
    const r = new FileReader()
    r.onerror = () => fout(r.error)
    r.onload = () => {
      const img = new Image()
      img.onerror = () => fout(new Error('Geen afbeelding'))
      img.onload = () => {
        const w = img.width || 256
        const h = img.height || 256
        const schaal = Math.min(1, 256 / Math.max(w, h))
        const c = document.createElement('canvas')
        c.width = Math.round(w * schaal)
        c.height = Math.round(h * schaal)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        ok(c.toDataURL('image/png'))
      }
      img.src = String(r.result)
    }
    r.readAsDataURL(file)
  })
}

/** Website en logo instellen (rijen voor een .info-list). */
export function MerkVelden({ contact, onChange }: { contact: Contact; onChange: (patch: Partial<Contact>) => void }) {
  const file = useRef<HTMLInputElement>(null)
  return (
    <>
      <div><span className="muted">Website</span>
        <input className="inline-input" placeholder="bedrijf.nl" value={contact.website ?? ''} onChange={(e) => onChange({ website: e.target.value.trim() || undefined })} />
      </div>
      <div><span className="muted">Logo</span>
        <span>
          <MerkLogo merk={contact} naam={contact.company} size={28} />
          <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange({ logo: await verklein(f) }); e.target.value = '' }} />
          <button className="link small" onClick={() => file.current?.click()}><Icon name="image" size={13} /> {contact.logo ? 'Ander logo' : 'Eigen logo'}</button>
          {contact.logo && <button className="link small" onClick={() => onChange({ logo: undefined })}>Logo van de website</button>}
        </span>
      </div>
    </>
  )
}
