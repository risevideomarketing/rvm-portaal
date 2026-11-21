// Facturen van één klant uit Moneybird, voor het klantportaal.
// Klant: alleen de eigen facturen. Team (admin/sales): ?klant=<id> voor de voorvertoning en het dossier.
// Koppeling: client.moneybirdContactId; leeg = zoeken op bedrijfsnaam in Moneybird-contacten.
// Nooit concepten. Per factuur de openbare Moneybird-link (bekijken, downloaden, betalen).
import { heeftRecht, sb, verifyAny } from '../lib/rise.mts'

interface Factuur { invoice_id: string | null; invoice_date: string | null; due_date: string | null; total_price_incl_tax: string; total_unpaid: string; state: string; url?: string; contact_id: string; currency?: string }
interface Contact { id: string; company_name?: string; firstname?: string; lastname?: string }

const mb = async <T,>(pad: string): Promise<T> => {
  const res = await fetch(`https://moneybird.com/api/v2/${process.env.MONEYBIRD_ADMINISTRATION_ID?.trim()}/${pad}`, {
    headers: { Authorization: `Bearer ${(process.env.MONEYBIRD_TOKEN ?? '').replace(/[^!-~]/g, '')}` },
  })
  if (!res.ok) throw new Error(`Moneybird ${res.status}`)
  return (await res.json()) as T
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

export default async (req: Request) => {
  const me = await verifyAny(req.headers.get('x-supabase-token'))
  if (!me) return new Response('Niet ingelogd', { status: 401 })
  const team = ['admin', 'medewerker', 'sales'].includes(me.role)
  if (team && !(await heeftRecht(me.person ?? '', me.role, 'geld'))) return new Response('Geen toegang tot facturen', { status: 403 })
  const clientId = me.client_id ?? (team ? new URL(req.url).searchParams.get('klant') : null)
  if (!clientId) return new Response('Klant ontbreekt', { status: 400 })
  if (!process.env.MONEYBIRD_TOKEN || !process.env.MONEYBIRD_ADMINISTRATION_ID) return Response.json({ gekoppeld: false, facturen: [] })

  const [rij] = await sb<{ data: { name?: string; moneybirdContactId?: string } }[]>(`clients?select=data&id=eq.${encodeURIComponent(clientId)}`)
  if (!rij) return new Response('Klant niet gevonden', { status: 404 })

  try {
    let contactId = rij.data.moneybirdContactId?.trim()
    let contactNaam: string | undefined
    if (!contactId && rij.data.name) {
      // Zoeken op bedrijfsnaam; alleen een eenduidige match telt (anders liever niets dan andermans facturen)
      const gevonden = await mb<Contact[]>(`contacts.json?query=${encodeURIComponent(rij.data.name)}&per_page=10`)
      const exact = gevonden.filter((c) => norm(c.company_name ?? '') === norm(rij.data.name!))
      const kandidaat = exact.length === 1 ? exact[0] : gevonden.length === 1 ? gevonden[0] : undefined
      contactId = kandidaat?.id
      contactNaam = kandidaat?.company_name
    }
    if (!contactId) return Response.json({ gekoppeld: true, contact: null, facturen: [], offertes: [] })

    // Offertes (?soort=offertes): alles behalve concepten en gearchiveerde
    if (new URL(req.url).searchParams.get('soort') === 'offertes') {
      const rows = await mb<{ estimate_id: string | null; estimate_date: string | null; due_date: string | null; total_price_excl_tax: string; state: string; url?: string; contact_id: string; reference?: string }[]>(`estimates.json?filter=${encodeURIComponent(`contact_id:${contactId},state:open|late|accepted|rejected|billed`)}&per_page=100`)
      const offertes = rows
        .filter((o) => o.contact_id === contactId && o.estimate_id && o.state !== 'draft')
        .map((o) => ({ nummer: o.estimate_id, datum: o.estimate_date, geldigTot: o.due_date, bedrag: Number(o.total_price_excl_tax), omschrijving: o.reference ?? '', status: o.state === 'accepted' || o.state === 'billed' ? 'akkoord' : o.state === 'rejected' ? 'afgewezen' : o.state === 'late' ? 'verlopen' : 'open', url: o.url }))
        .sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? ''))
      return Response.json({ gekoppeld: true, offertes })
    }

    const alle: Factuur[] = []
    for (let page = 1; page <= 10; page++) {
      const rows = await mb<Factuur[]>(`sales_invoices.json?filter=${encodeURIComponent(`contact_id:${contactId},state:open|pending_payment|reminded|late|paid`)}&per_page=100&page=${page}`)
      alle.push(...rows)
      if (rows.length < 100) break
    }
    const vandaag = new Date().toISOString().slice(0, 10)
    const facturen = alle
      .filter((f) => f.contact_id === contactId && f.state !== 'draft' && f.invoice_id)
      .map((f) => ({
        nummer: f.invoice_id,
        datum: f.invoice_date,
        vervaldatum: f.due_date,
        bedrag: Number(f.total_price_incl_tax),
        openstaand: Number(f.total_unpaid),
        status: f.state === 'paid' ? 'betaald' : f.state === 'late' || f.state === 'reminded' || (f.due_date && f.due_date < vandaag) ? 'te laat' : 'open',
        url: f.url,
      }))
      .sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? ''))
    return Response.json({ gekoppeld: true, contact: team ? { id: contactId, naam: contactNaam } : undefined, facturen })
  } catch (e) {
    return new Response((e as Error).message, { status: 502 })
  }
}
