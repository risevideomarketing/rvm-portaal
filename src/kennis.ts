// Kennisbank uit Supabase (tabel kennisbank). Team ziet alles, een klant alleen artikelen met klant: true (RLS).
// Afbeeldingen staan in de privé-opslag (bucket "bestanden", map kennisbank/) en krijgen een tijdelijke link.
import { useEffect, useState } from 'react'
import { ARTICLES_LOKAAL } from './data/mock'
import type { Article } from './data/types'
import { supabase } from './supabase'

let cache: Article[] | null = supabase ? null : ARTICLES_LOKAAL
let bezig: Promise<Article[]> | null = null

function laad(): Promise<Article[]> {
  if (cache) return Promise.resolve(cache)
  if (!bezig && supabase) {
    bezig = Promise.resolve(supabase.from('kennisbank').select('data')).then(({ data }) => {
      cache = ((data ?? []) as { data: Article }[]).map((r) => r.data).sort((a, b) => (a.id < b.id ? -1 : 1))
      return cache
    })
  }
  return bezig ?? Promise.resolve([])
}

const luisteraars = new Set<(l: Article[]) => void>()
const zet = (l: Article[]) => { cache = l; luisteraars.forEach((f) => f(l)) }

export function useArtikelen(): Article[] {
  const [lijst, setLijst] = useState<Article[]>(cache ?? [])
  useEffect(() => {
    let stop = false
    laad().then((l) => !stop && setLijst(l))
    luisteraars.add(setLijst)
    return () => { stop = true; luisteraars.delete(setLijst) }
  }, [])
  return lijst
}

/** Artikel opslaan (nieuw of bijgewerkt). Lokaal alleen in deze sessie. */
export async function bewaarArtikel(a: Article): Promise<string | void> {
  const nieuw = [...(cache ?? []).filter((x) => x.id !== a.id), a].sort((x, y) => (x.id < y.id ? -1 : 1))
  zet(nieuw)
  if (!supabase) return
  const { error } = await supabase.from('kennisbank').upsert({ id: a.id, data: a, updated_at: new Date().toISOString() })
  if (error) return error.message
}

/** Artikel verwijderen. */
export async function verwijderArtikel(id: string): Promise<string | void> {
  zet((cache ?? []).filter((x) => x.id !== id))
  if (!supabase) return
  const { error } = await supabase.from('kennisbank').delete().eq('id', id)
  if (error) return error.message
}

/** Link naar een afbeelding uit de kennisbank: lokaal uit public/img, live een tijdelijke link uit de opslag. */
export function useKennisAfbeelding(pad?: string): string {
  const lokaalPad = !pad ? '' : pad.startsWith('/') ? pad : `/img/${pad}`
  const [url, setUrl] = useState(supabase ? '' : lokaalPad)
  useEffect(() => {
    if (!supabase || !pad) return
    supabase.storage.from('bestanden').createSignedUrl(pad.replace(/^\/?img\//, ''), 3600).then(({ data }) => setUrl(data?.signedUrl ?? ''))
  }, [pad])
  return url
}

/** Wat er nu geladen is (voor plekken buiten een component). Gebruik daarnaast useArtikelen() om te laden en te verversen. */
export const artikelenNu = (): Article[] => cache ?? []
