// Meta-commissie per klant: het afgesproken percentage van de aankoopwaarde uit Meta, gedeeld door 1,21 (ex btw).
// GET  ?klant=<id>&maand=YYYY-MM  → berekening (team met recht "geld", of de klant zelf in het portaal)
// POST { klant, maand }           → de commissie als regel op de conceptfactuur van de klant in Moneybird (beheerder of recht "geld").
//                                   Bestaat er al een commissieregel voor die maand op het concept, dan wordt die bijgewerkt.
// Er wordt nooit iets verstuurd: het blijft een concept in Moneybird.
import { insights, metaGekoppeld } from '../lib/meta.mts'
import { contactVoorKlant, mb, moneybirdGekoppeld } from '../lib/moneybird.mts'
import { heeftRecht, sb, verifyAny } from '../lib/rise.mts'

type Venster = '7d_click' | '1d_click' | '7d_click_1d_view'
interface Klant { name?: string; metaAdAccount?: string; moneybirdContactId?: string; commissiePct?: number; commissieVenster?: Venster; commissieGefactureerd?: Record<string, { bedrag: number; at: string; by?: string }> }

const VENSTER_TEKST: Record<Venster, string> = {
  '7d_click': 'Meta-aankopen, 7 dagen na klik',
  '1d_click': 'Meta-aankopen, 1 dag na klik',
  '7d_click_1d_view': 'Meta-aankopen, 7 dagen na klik of 1 dag na weergave',
}
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const maandNaam = (m: string) => `${MAANDEN[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

/** Eerste en laatste dag van de maand (tot vandaag als de maand nog loopt). */
function periode(maand: string) {
  const [j, m] = maand.split('-').map(Number)
  const eind = new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10)
  const vandaag = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date())
  return { since: `${maand}-01`, until: eind < vandaag ? eind : vandaag, loopt: eind >= vandaag }
}

async function bereken(k: Klant, maand: string) {
  const p = periode(maand)
  const venster: Venster = k.commissieVenster ?? '7d_click'
  const c = await insights(k.metaAdAccount!, { since: p.since, until: p.until }, venster === '7d_click_1d_view' ? ['7d_click', '1d_view'] : [venster])
  const pct = k.commissiePct ?? 0
  const exBtw = Math.round((c.omzet / 1.21) * 100) / 100
  const bedrag = Math.round(exBtw * pct) / 100
  return { maand, maandNaam: maandNaam(maand), van: p.since, tot: p.until, loopt: p.loopt, venster, afspraak: VENSTER_TEKST[venster], aankopen: c.aankopen, aankoopwaarde: c.omzet, exBtw, pct, bedrag, gefactureerd: k.commissieGefactureerd?.[maand] ?? null }
}

export default async (req: Request) => {
  const me = await verifyAny(req.headers.get('x-supabase-token'))
  if (!me) return new Response('Niet ingelogd', { status: 401 })
  const team = ['admin', 'medewerker', 'sales'].includes(me.role)
  if (team && !(await heeftRecht(me.person ?? '', me.role, 'geld'))) return new Response('Geen toegang tot geld en facturen', { status: 403 })

  const url = new URL(req.url)
  const body = req.method === 'POST' ? (((await req.json().catch(() => ({}))) ?? {}) as { klant?: string; maand?: string }) : {}
  const klantId = me.client_id ?? (team ? body.klant ?? url.searchParams.get('klant') : null)
  const maand = (body.maand ?? url.searchParams.get('maand') ?? new Date().toISOString().slice(0, 7)).slice(0, 7)
  if (!klantId) return new Response('Klant ontbreekt', { status: 400 })
  if (!/^\d{4}-\d{2}$/.test(maand)) return new Response('Maand als YYYY-MM', { status: 400 })

  const [rij] = await sb<{ data: Klant }[]>(`clients?select=data&id=eq.${encodeURIComponent(klantId)}`)
  if (!rij) return new Response('Klant niet gevonden', { status: 404 })
  const k = rij.data
  if (!k.commissiePct || !k.metaAdAccount) return Response.json({ actief: false })
  if (!metaGekoppeld()) return Response.json({ actief: true, fout: 'Meta is niet gekoppeld' })

  try {
    const b = await bereken(k, maand)
    if (req.method !== 'POST') return Response.json({ actief: true, ...b })

    // Naar Moneybird: alleen het team, nooit de klant
    if (!team) return new Response('Alleen het team', { status: 403 })
    if (!moneybirdGekoppeld()) return new Response('Moneybird is niet gekoppeld', { status: 503 })
    if (b.bedrag <= 0) return new Response('Geen commissie voor deze maand (geen aankoopwaarde)', { status: 409 })
    const contact = await contactVoorKlant(k)
    if (!contact) return new Response(`Geen eenduidig Moneybird-contact voor ${k.name}. Vul het Moneybird contact-ID in bij de klant.`, { status: 409 })

    const omschrijving = `Commissie Meta-aankopen ${b.maandNaam}: ${String(b.pct).replace('.', ',')}% van € ${b.exBtw.toFixed(2).replace('.', ',')} aankoopwaarde ex btw (${b.afspraak.toLowerCase()})`
    const sleutel = `Commissie Meta-aankopen ${b.maandNaam}`
    const tarieven = await mb<{ id: string; percentage: string; active: boolean; tax_rate_type: string }[]>('tax_rates.json?filter=tax_rate_type:sales_invoice')
    const btw21 = tarieven.find((t) => t.active && Number(t.percentage) === 21)
    const regel = { description: omschrijving, price: b.bedrag.toFixed(2), amount: '1', ...(btw21 ? { tax_rate_id: btw21.id } : {}) }

    // Het nieuwste concept van deze klant; anders een nieuw concept
    const concepten = await mb<{ id: string; contact_id: string; created_at: string; details: { id: string; description: string }[] }[]>(`sales_invoices.json?filter=${encodeURIComponent(`state:draft,contact_id:${contact.id}`)}&per_page=50`)
    const concept = concepten.filter((c) => c.contact_id === contact.id).sort((a, x) => x.created_at.localeCompare(a.created_at))[0]
    let factuurId: string
    if (concept) {
      const bestaand = concept.details.find((x) => x.description.startsWith(sleutel))
      await mb(`sales_invoices/${concept.id}.json`, { method: 'PATCH', body: { sales_invoice: { details_attributes: [{ ...(bestaand ? { id: bestaand.id } : {}), ...regel }] } } })
      factuurId = concept.id
    } else {
      const nieuw = await mb<{ id: string }>('sales_invoices.json', { method: 'POST', body: { sales_invoice: { contact_id: contact.id, prices_are_incl_tax: false, details_attributes: [regel] } } })
      factuurId = nieuw.id
    }

    // Vastleggen bij de klant (zodat iedereen ziet dat het al op een concept staat)
    const [vers] = await sb<{ data: Klant & Record<string, unknown> }[]>(`clients?select=data&id=eq.${encodeURIComponent(klantId)}`)
    const data = { ...vers.data, commissieGefactureerd: { ...(vers.data.commissieGefactureerd ?? {}), [maand]: { bedrag: b.bedrag, at: new Date().toISOString(), by: me.person ?? undefined } } }
    await sb(`clients?id=eq.${encodeURIComponent(klantId)}`, { method: 'PATCH', body: JSON.stringify({ data, updated_at: new Date().toISOString(), updated_by: null }) })

    return Response.json({ ok: true, ...b, gefactureerd: data.commissieGefactureerd[maand], factuur: factuurId, nieuwConcept: !concept })
  } catch (e) {
    return new Response((e as Error).message, { status: 502 })
  }
}
