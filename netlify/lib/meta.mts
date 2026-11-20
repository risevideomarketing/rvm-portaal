// Meta-cijfers ophalen (Graph API, insights op accountniveau) en het weekoverzicht per klant maken.
// Nodig in Netlify: META_ACCESS_TOKEN (geheim, systeemgebruiker in het Rise-portfolio met ads_read).
import { sb } from './rise.mts'

const VERSIE = process.env.META_API_VERSION ?? 'v23.0'

export interface Cijfers {
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
  /** Maandag en zondag van de week (YYYY-MM-DD, Nederlandse tijd). */
  van: string
  tot: string
  week: Cijfers
  vorige: Cijfers
  /** Alles sinds de start van het account. */
  totaal: Cijfers
  gemaakt: string
}

type Actie = { action_type: string; value: string }
const eerste = (lijst: Actie[] | undefined, types: string[]) => {
  for (const t of types) {
    const x = lijst?.find((a) => a.action_type === t)
    if (x) return Number(x.value)
  }
  return 0
}
const LEADS = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead']
const AANKOPEN = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']

export const metaGekoppeld = () => Boolean(process.env.META_ACCESS_TOKEN)

/** Cijfers van een advertentieaccount voor een periode: { since, until } of een Meta date_preset. */
/** @param vensters Meta-attributievensters, bijv. ['7d_click'] (leeg = standaard van het account). */
export async function insights(account: string, periode: { since: string; until: string } | { preset: string }, vensters?: string[]): Promise<Cijfers> {
  const act = account.trim().startsWith('act_') ? account.trim() : `act_${account.trim()}`
  const q = new URLSearchParams({ fields: 'spend,reach,clicks,actions,action_values', access_token: (process.env.META_ACCESS_TOKEN ?? '').replace(/[^!-~]/g, '') /* alleen zichtbare tekens: geplakte tokens nemen soms regeleindes of onzichtbare tekens mee */ })
  if (vensters?.length) q.set('action_attribution_windows', JSON.stringify(vensters))
  if ('preset' in periode) q.set('date_preset', periode.preset)
  else q.set('time_range', JSON.stringify(periode))
  const res = await fetch(`https://graph.facebook.com/${VERSIE}/${act}/insights?${q}`)
  if (!res.ok) {
    // Foutmelding van Meta doorgeven, nooit de url (daar staat het token in)
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(`Meta: ${err.error?.message ?? res.status}`)
  }
  const json = (await res.json()) as { data: { spend?: string; reach?: string; clicks?: string; actions?: Actie[]; action_values?: Actie[] }[] }
  const d = json.data[0] ?? {}
  const spend = Number(d.spend ?? 0)
  const leads = eerste(d.actions, LEADS)
  const aankopen = eerste(d.actions, AANKOPEN)
  const omzet = eerste(d.action_values, AANKOPEN)
  return {
    spend,
    bereik: Number(d.reach ?? 0),
    klikken: Number(d.clicks ?? 0),
    leads,
    aankopen,
    omzet,
    kostenPerLead: leads ? spend / leads : null,
    kostenPerAankoop: aankopen ? spend / aankopen : null,
    roas: spend && omzet ? omzet / spend : null,
  }
}

const dag = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const plus = (iso: string, n: number) => {
  const x = new Date(`${iso}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/** Maandag t/m zondag van de laatste volledige week (Nederlandse tijd). */
export function vorigeWeek(nu = new Date()): { van: string; tot: string } {
  const vandaag = dag(nu)
  const wd = new Date(`${vandaag}T12:00:00Z`).getUTCDay() // 0 = zondag
  const maandagDezeWeek = plus(vandaag, -((wd + 6) % 7))
  return { van: plus(maandagDezeWeek, -7), tot: plus(maandagDezeWeek, -1) }
}

/** Weekoverzicht maken en bewaren in meta_weekly (één rij per klant per week; opnieuw draaien overschrijft). */
export async function maakWeekoverzicht(clientId: string, account: string, nu = new Date()): Promise<Weekoverzicht> {
  const { van, tot } = vorigeWeek(nu)
  const [week, vorige, totaal] = await Promise.all([
    insights(account, { since: van, until: tot }),
    insights(account, { since: plus(van, -7), until: plus(tot, -7) }),
    insights(account, { preset: 'maximum' }),
  ])
  const data: Weekoverzicht = { van, tot, week, vorige, totaal, gemaakt: nu.toISOString() }
  await sb('meta_weekly?on_conflict=client_id,week_start', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ client_id: clientId, week_start: van, data, created_at: nu.toISOString() }),
  })
  return data
}

/** Alle klanten met een advertentieaccount. */
export async function klantenMetMeta(): Promise<{ id: string; account: string }[]> {
  const rows = await sb<{ id: string; data: { metaAdAccount?: string } }[]>('clients?select=id,data')
  return rows.filter((r) => r.data.metaAdAccount?.trim()).map((r) => ({ id: r.id, account: r.data.metaAdAccount!.trim() }))
}
