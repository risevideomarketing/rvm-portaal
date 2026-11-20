// Bestanden (pdf's, scripts, briefs, beelden) bij een klant of project.
// Live: Supabase Storage, bucket "bestanden" (privé, alleen het team). Lokaal: als data-url in de browser (max 2 MB).
import type { Bestand, PersonId } from './data/types'
import { supabase } from './supabase'
import { uid } from './store'

export const MAX_MB = 25
const LOKAAL_MAX = 2 * 1024 * 1024

const veiligeNaam = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80)

/** Uploaden naar map (bijv. "klant/umc" of "project/abc"). Geeft het bestand terug of een foutmelding. */
export async function uploaden(map: string, f: File, by: PersonId): Promise<{ bestand?: Bestand; fout?: string }> {
  if (f.size > MAX_MB * 1024 * 1024) return { fout: `${f.name} is groter dan ${MAX_MB} MB. Zet grote bestanden (video) in Drive of Frame.io en voeg de link toe.` }
  const id = uid()
  const basis = { id, naam: f.name, type: f.type || 'application/octet-stream', grootte: f.size, at: new Date().toISOString(), by }
  if (!supabase) {
    if (f.size > LOKAAL_MAX) return { fout: 'Lokaal kunnen alleen bestanden tot 2 MB (live tot 25 MB).' }
    const pad = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f) })
    return { bestand: { ...basis, pad } }
  }
  const pad = `${map}/${id}-${veiligeNaam(f.name)}`
  const { error } = await supabase.storage.from('bestanden').upload(pad, f, { contentType: basis.type, upsert: false })
  if (error) return { fout: `Uploaden lukte niet: ${error.message}` }
  return { bestand: { ...basis, pad } }
}

/** Tijdelijke link om het bestand te openen (1 uur geldig). */
export async function openLink(b: Bestand): Promise<string | null> {
  if (b.pad.startsWith('data:')) return b.pad
  if (!supabase) return null
  const { data } = await supabase.storage.from('bestanden').createSignedUrl(b.pad, 3600)
  return data?.signedUrl ?? null
}

/** Uit de opslag halen (na bevestiging in de UI). */
export async function weghalen(b: Bestand): Promise<void> {
  if (b.pad.startsWith('data:') || !supabase) return
  await supabase.storage.from('bestanden').remove([b.pad])
}

export const grootteTekst = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`)
