import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Supabase-client. Zonder VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY draait de app in
 * demostand: voorbeelddata in de eigen browser, geen login. Handig om lokaal te bouwen.
 */
/** Fout uit een verlopen of al gebruikte inloglink (#error_description=...). Lezen vóór Supabase de URL opschoont. */
export const linkFoutUitUrl: string = (() => {
  const h = new URLSearchParams(window.location.hash.slice(1))
  return h.get('error_description') || h.get('error') || ''
})()

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null

export const isLive = !!supabase
