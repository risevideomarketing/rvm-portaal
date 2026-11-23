import { supabase } from './supabase'

/**
 * Stuurt een directe melding via de server (netlify/functions/slack-notify).
 * Het Supabase-token gaat in een eigen header (X-Supabase-Token); de functie controleert het zelf.
 */
export async function notify(body: { kind: 'tag' | 'feedback' | 'test'; taskId?: string; text?: string; step?: string }) {
  if (!supabase) return { ok: false, error: 'demostand' }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'niet ingelogd' }
  try {
    const res = await fetch('/.netlify/functions/slack-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Supabase-Token': token },
      body: JSON.stringify(body),
    })
    return res.ok ? { ok: true } : { ok: false, error: `${res.status} ${await res.text()}` }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Roept een eigen Netlify-functie aan met het Supabase-token van de ingelogde gebruiker. */
async function api(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  return fetch(`/.netlify/functions/${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Supabase-Token': token, ...(init.headers ?? {}) } })
}

/** Gewijzigde taken naar de Rise-agenda (Google Agenda). Fouten alleen in de console: de taak zelf is al opgeslagen. */
export async function agendaSync(ids: string[], weg: string[] = [], projecten: string[] = []) {
  try {
    const res = await api('agenda', { method: 'POST', body: JSON.stringify({ ids, weg, projecten }) })
    if (res && !res.ok) console.error('Agenda bijwerken mislukt', res.status, await res.text())
  } catch (e) {
    console.error('Agenda bijwerken mislukt', e)
  }
}

/** Klant zet een eigen taak op gedaan of weer open (alleen de ingelogde klant). */
export async function klantTaakAf(taakId: string, gedaan: boolean): Promise<{ ok: boolean; klantTaken?: import('./data/types').KlantTaak[]; fout?: string }> {
  try {
    const res = await api('klant-taak', { method: 'POST', body: JSON.stringify({ taakId, gedaan }) })
    if (!res) return { ok: false, fout: 'Niet ingelogd' }
    if (!res.ok) return { ok: false, fout: await res.text() }
    return { ok: true, klantTaken: ((await res.json()) as { klantTaken: import('./data/types').KlantTaak[] }).klantTaken }
  } catch (e) {
    return { ok: false, fout: (e as Error).message }
  }
}

/** Klant voegt een contentplek toe of haalt een eigen contentplek weg (alleen de ingelogde klant). */
export async function klantContent(body: { actie: 'toevoegen'; titel: string; url: string } | { actie: 'weg'; id: string }): Promise<{ ok: boolean; contentPlekken?: import('./data/types').ContentPlek[]; fout?: string }> {
  try {
    const res = await api('klant-content', { method: 'POST', body: JSON.stringify(body) })
    if (!res) return { ok: false, fout: 'Niet ingelogd' }
    if (!res.ok) return { ok: false, fout: await res.text() }
    return { ok: true, contentPlekken: ((await res.json()) as { contentPlekken: import('./data/types').ContentPlek[] }).contentPlekken }
  } catch (e) {
    return { ok: false, fout: (e as Error).message }
  }
}

/** Klant stuurt een hulpvraag (komt binnen in Slack en in het dossier). */
export async function klantVraag(tekst: string): Promise<{ ok: boolean; hulpvragen?: import('./data/types').Hulpvraag[]; fout?: string }> {
  try {
    const res = await api('klant-vraag', { method: 'POST', body: JSON.stringify({ tekst }) })
    if (!res) return { ok: false, fout: 'Niet ingelogd' }
    if (!res.ok) return { ok: false, fout: await res.text() }
    return { ok: true, hulpvragen: ((await res.json()) as { hulpvragen: import('./data/types').Hulpvraag[] }).hulpvragen }
  } catch (e) {
    return { ok: false, fout: (e as Error).message }
  }
}

export interface KlantFactuur { nummer: string; datum: string | null; vervaldatum: string | null; bedrag: number; openstaand: number; status: 'betaald' | 'open' | 'te laat'; url?: string }
/** Facturen van een klant uit Moneybird (klant: eigen facturen; team: van deze klant). null = lokaal of niet ingelogd. */
export async function klantFacturen(klant: string): Promise<{ gekoppeld: boolean; contact?: { id: string; naam?: string } | null; facturen: KlantFactuur[] } | { fout: string } | null> {
  try {
    const res = await api(`klant-facturen?klant=${encodeURIComponent(klant)}`)
    if (!res) return null
    if (!res.ok) return { fout: await res.text() }
    return await res.json()
  } catch (e) {
    return { fout: (e as Error).message }
  }
}

export interface Commissie {
  maand: string; maandNaam: string; van: string; tot: string; loopt: boolean; venster: string; afspraak: string
  aankopen: number; aankoopwaarde: number; exBtw: number; pct: number; bedrag: number
  gefactureerd: { bedrag: number; at: string; by?: string } | null
  nieuwConcept?: boolean
}
/** Meta-commissie van een maand (team met recht geld, of de klant zelf). */
export async function commissieOphalen(klant: string, maand: string): Promise<Commissie | { fout: string }> {
  try {
    const res = await api(`commissie?klant=${encodeURIComponent(klant)}&maand=${maand}`)
    if (!res) return { fout: 'Niet ingelogd' }
    if (!res.ok) return { fout: await res.text() }
    const j = await res.json()
    if (!j.actief) return { fout: 'Geen commissie ingesteld' }
    if (j.fout) return { fout: j.fout }
    return j as Commissie
  } catch (e) {
    return { fout: (e as Error).message }
  }
}
/** Commissie op de conceptfactuur in Moneybird zetten (nooit versturen). */
export async function commissieFactureren(klant: string, maand: string): Promise<Commissie | { fout: string }> {
  try {
    const res = await api('commissie', { method: 'POST', body: JSON.stringify({ klant, maand }) })
    if (!res) return { fout: 'Niet ingelogd' }
    if (!res.ok) return { fout: await res.text() }
    return (await res.json()) as Commissie
  } catch (e) {
    return { fout: (e as Error).message }
  }
}

/** Korte f.io-link omzetten naar de volledige Frame.io-deellink (die wel ingesloten kan worden). null = lukt niet (lokaal of fout). */
export async function frameLinkVolledig(url: string): Promise<string | null> {
  try {
    const res = await api(`frame-link?url=${encodeURIComponent(url)}`)
    if (!res?.ok) return null
    return ((await res.json()) as { url?: string }).url ?? null
  } catch {
    return null
  }
}

/** Team opslaan vanaf Instellingen (alleen beheerders): niveau, rechten en nieuwe mensen. */
export async function teamOpslaan(leden: { email: string; naam: string; functie: string; role: 'admin' | 'medewerker' | 'uit'; rechten: Record<string, boolean | undefined> }[]): Promise<{ ok: boolean; fout?: string }> {
  try {
    const res = await api('team', { method: 'POST', body: JSON.stringify({ leden }) })
    if (!res) return { ok: false, fout: 'Niet ingelogd' }
    return res.ok ? { ok: true } : { ok: false, fout: await res.text() }
  } catch (e) {
    return { ok: false, fout: (e as Error).message }
  }
}

/** De inlogmail (opnieuw) sturen naar iemand uit het team (alleen beheerders). */
export async function inlogmailSturen(email: string): Promise<{ ok: boolean; fout?: string }> {
  try {
    const res = await api('team', { method: 'POST', body: JSON.stringify({ uitnodigen: email }) })
    if (!res) return { ok: false, fout: 'Niet ingelogd' }
    return res.ok ? { ok: true } : { ok: false, fout: await res.text() }
  } catch (e) {
    return { ok: false, fout: (e as Error).message }
  }
}

/** Eigen Slack-meldingen opslaan. */
export async function mijnMeldingenOpslaan(meldingen: Record<string, boolean | undefined>): Promise<{ ok: boolean; fout?: string }> {
  try {
    const res = await api('mijn-instellingen', { method: 'POST', body: JSON.stringify({ meldingen }) })
    if (!res) return { ok: false, fout: 'Niet ingelogd' }
    return res.ok ? { ok: true } : { ok: false, fout: await res.text() }
  } catch (e) {
    return { ok: false, fout: (e as Error).message }
  }
}

/** Volledige kopie: live uit de database (functie export), lokaal van wat er nu in de browser staat. */
export async function alleGegevensExporteren(s: { tasks: unknown[]; contacts: unknown[]; clients: unknown[]; projects: unknown[]; team: unknown[] }): Promise<{ bron: 'server' | 'lokaal'; data: unknown }> {
  try {
    const res = await api('export')
    if (res?.ok) return { bron: 'server', data: await res.json() }
  } catch { /* lokaal of geen verbinding: val terug op wat er in de browser staat */ }
  return { bron: 'lokaal', data: { versie: 1, gemaakt: new Date().toISOString(), lokaal: true, tasks: s.tasks, contacts: s.contacts, clients: s.clients, projects: s.projects, team: s.team } }
}

/** Klantlogin aanmaken (alleen admins). */
export async function giveAccess(clientId: string, email: string, naam = ''): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await api('klant-toegang', { method: 'POST', body: JSON.stringify({ clientId, email, naam }) })
    if (!res) return { ok: false, text: 'Niet ingelogd.' }
    if (!res.ok) return { ok: false, text: await res.text() }
    const j = (await res.json()) as { gemaild?: boolean }
    return { ok: true, text: j.gemaild ? `Welkomstmail is verstuurd naar ${email}.` : `${email} kan inloggen. De welkomstmail ging niet (mail nog niet gekoppeld).` }
  } catch (e) {
    return { ok: false, text: (e as Error).message }
  }
}

/** Fout of antwoord van een eigen functie, zonder te gooien. */
async function haal<T>(path: string, init?: RequestInit): Promise<T | { fout: string }> {
  try {
    const res = await api(path, init)
    if (!res) return { fout: 'Niet ingelogd' }
    return res.ok ? ((await res.json()) as T) : { fout: await res.text() }
  } catch (e) {
    return { fout: (e as Error).message }
  }
}

export interface MoneybirdCijfers {
  gekoppeld: boolean
  periode?: 'maand' | 'jaar'
  bijgewerkt?: string
  omzet?: number
  kosten?: number
  winst?: number
  betalingen?: { aantal: number; bedrag: number }
  concept?: { aantal: number; bedrag: number; exBtw?: number }
  open?: { aantal: number; bedrag: number; teLaat: number }
}

/** Omzet, kosten, winst, betalingen, concept- en openstaande facturen (alleen admins). */
export interface Offerte { id: string; nummer: string | null; datum: string | null; geldigTot: string | null; status: string; omschrijving: string; bedrag: number; klant: string; contactId: string; url: string }
export const alleOffertes = () => haal<{ gekoppeld: boolean; offertes?: Offerte[] }>('moneybird?soort=offertes')
export const moneybird = (periode: 'maand' | 'jaar') => haal<MoneybirdCijfers>(`moneybird?periode=${periode}`)

/** Meta-cijfers over één periode (zelfde vorm als netlify/lib/meta.mts). spend -1 = verborgen voor de klant. */
export interface MetaGetallen {
  spend: number
  bereik: number
  klikken: number
  leads: number
  aankopen: number
  omzet: number
  kostenPerLead: number | null
  kostenPerAankoop: number | null
  roas: number | null
}

export interface Weekoverzicht {
  van: string
  tot: string
  week: MetaGetallen
  vorige: MetaGetallen
  totaal: MetaGetallen
  gemaakt: string
}

/** Laatste weekoverzicht van één klant (null = nog geen overzicht). */
export const weekoverzicht = (clientId: string) => haal<{ overzicht: Weekoverzicht | null }>(`meta?clientId=${encodeURIComponent(clientId)}`)

/** Laatste weekoverzicht van alle klanten (team). */
export const alleWeekoverzichten = () => haal<{ overzichten: Record<string, Weekoverzicht> }>('meta?alle=1')

/** Weekoverzicht nu maken voor één klant (admin). */
export const weekoverzichtNu = (clientId: string) => haal<{ overzicht: Weekoverzicht }>('meta', { method: 'POST', body: JSON.stringify({ clientId }) })

export type EigenPeriode = '7d' | '30d' | 'maand' | 'vorigeMaand'
/** Live cijfers van één klant (team, statistieken). */
export const klantMetaLive = (clientId: string, periode: EigenPeriode) => haal<{ gekoppeld: boolean; bijgewerkt?: string; cijfers?: MetaGetallen }>(`meta?clientId=${encodeURIComponent(clientId)}&live=1&periode=${periode}`)

/** Live cijfers van de eigen Rise-advertenties (team). */
export const eigenMeta = (periode: EigenPeriode) => haal<{ gekoppeld: boolean; bijgewerkt?: string; cijfers?: MetaGetallen }>(`meta?eigen=1&periode=${periode}`)

export interface AnalyticsCijfers {
  gekoppeld: boolean
  dagen?: number
  nu?: { bezoekers: number; sessies: number; conversies: number }
  ervoor?: { bezoekers: number; sessies: number; conversies: number }
  kanalen?: { naam: string; sessies: number }[]
}
/** Google Analytics van risevideomarketing.nl (team). */
export const analytics = (periode: '7d' | '30d', clientId?: string) => haal<AnalyticsCijfers>(`analytics?periode=${periode}${clientId ? `&clientId=${encodeURIComponent(clientId)}` : ''}`)

export interface Afspraak { id: string; titel: string; start: string; eind: string; heleDag: boolean; agenda: string; plek?: string; link?: string }
/** Google Agenda: vandaag en de komende 6 dagen (team). */
export const agendaLijst = () => haal<{ agendas: { naam: string; id: string }[] }>('mijn-agenda?lijst=1')
export const mijnAgenda = () => haal<{ gekoppeld: boolean; afspraken: Afspraak[]; fout?: string }>('mijn-agenda')

export interface StatusCheck { naam: string; ok: boolean; uitleg: string }
export const koppelingStatus = () => haal<{ checks: StatusCheck[] }>('status')

export type Aanlevering = { soort: 'link'; titel: string; url: string } | { soort: 'datum'; titel: string; datum: string } | { soort: 'bestand'; titel: string; bestand: File }
/** Klant levert iets aan (link, bestand of datum). Bestanden gaan direct naar de opslag via een tijdelijke upload-URL. */
export async function klantAanleveren(a: Aanlevering): Promise<{ ok: boolean; data?: { links: unknown[]; bestanden: unknown[]; planning: unknown[] }; fout?: string }> {
  try {
    let body: Record<string, unknown> = a
    if (a.soort === 'bestand') {
      if (a.bestand.size > 50 * 1024 * 1024) return { ok: false, fout: 'Maximaal 50 MB. Grotere bestanden (video) liever als link, bijv. WeTransfer of Drive.' }
      const plek = await api('klant-aanleveren', { method: 'POST', body: JSON.stringify({ soort: 'uploadplek', naam: a.bestand.name }) })
      if (!plek?.ok) return { ok: false, fout: plek ? await plek.text() : 'Niet ingelogd' }
      const { pad, url } = (await plek.json()) as { pad: string; url: string }
      const up = await fetch(url, { method: 'PUT', headers: { 'Content-Type': a.bestand.type || 'application/octet-stream' }, body: a.bestand })
      if (!up.ok) return { ok: false, fout: `Uploaden lukte niet (${up.status})` }
      body = { soort: 'bestand', titel: a.titel, pad, naam: a.bestand.name, type: a.bestand.type, grootte: a.bestand.size }
    }
    const res = await api('klant-aanleveren', { method: 'POST', body: JSON.stringify(body) })
    if (!res) return { ok: false, fout: 'Niet ingelogd' }
    if (!res.ok) return { ok: false, fout: await res.text() }
    return { ok: true, data: await res.json() }
  } catch (e) {
    return { ok: false, fout: (e as Error).message }
  }
}

export interface KlantOfferte { nummer: string; datum: string | null; geldigTot: string | null; bedrag: number | null; omschrijving: string; status: 'open' | 'akkoord' | 'afgewezen' | 'verlopen' | 'pdf'; url?: string }
/** Offertes van een klant uit Moneybird. null = lokaal of niet ingelogd. */
export async function klantOffertes(klant: string): Promise<{ offertes: KlantOfferte[] } | { fout: string } | null> {
  try {
    const res = await api(`klant-facturen?soort=offertes&klant=${encodeURIComponent(klant)}`)
    if (!res) return null
    if (!res.ok) return { fout: await res.text() }
    const j = (await res.json()) as { offertes?: KlantOfferte[] }
    return { offertes: j.offertes ?? [] }
  } catch (e) {
    return { fout: (e as Error).message }
  }
}

/** Klanten waar de ingelogde klant toegang toe heeft (één adres kan bij meerdere organisaties horen). */
export async function mijnKlanten(): Promise<{ actief: string | null; klanten: { id: string; naam: string }[] } | null> {
  try {
    const res = await api('klant-wissel')
    if (!res?.ok) return null
    return (await res.json()) as { actief: string | null; klanten: { id: string; naam: string }[] }
  } catch { return null }
}
/** Wissel van portaal; daarna de pagina opnieuw laden. */
export async function wisselKlant(clientId: string): Promise<boolean> {
  try {
    const res = await api('klant-wissel', { method: 'POST', body: JSON.stringify({ clientId }) })
    return Boolean(res?.ok)
  } catch { return false }
}
