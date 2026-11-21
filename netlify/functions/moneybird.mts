// Cijfers uit Moneybird voor de statistieken (alleen admins).
// Nodig in Netlify: MONEYBIRD_TOKEN (geheim) en MONEYBIRD_ADMINISTRATION_ID.
// GET ?periode=maand|jaar → omzet, kosten en winst (excl. btw), betalingen ontvangen, plus conceptfacturen en openstaande facturen.
import { heeftRecht, verifyUser } from '../lib/rise.mts'

interface Doc { state?: string; total_price_excl_tax?: string; total_price_incl_tax?: string; total_unpaid?: string; paid_at?: string | null; due_date?: string }

async function lijst(pad: string, filter: string): Promise<Doc[]> {
  const out: Doc[] = []
  for (let page = 1; page <= 20; page++) {
    const url = `https://moneybird.com/api/v2/${process.env.MONEYBIRD_ADMINISTRATION_ID?.trim()}/${pad}.json?filter=${encodeURIComponent(filter)}&per_page=100&page=${page}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${(process.env.MONEYBIRD_TOKEN ?? '').replace(/[^!-~]/g, '')}` } })
    if (!res.ok) throw new Error(`Moneybird ${pad} ${res.status}`)
    const rows = (await res.json()) as Doc[]
    out.push(...rows)
    if (rows.length < 100) break
  }
  return out
}

const som = (list: Doc[], veld: keyof Doc = 'total_price_incl_tax') =>
  Math.round(list.reduce((a, i) => a + Number(i[veld] ?? i.total_price_incl_tax ?? 0), 0) * 100) / 100

export default async (req: Request) => {
  const me = await verifyUser(req.headers.get('x-supabase-token'))
  if (!me || !(await heeftRecht(me.person, me.role, 'geld'))) return new Response('Geen toegang tot geldzaken', { status: 401 })
  if (!process.env.MONEYBIRD_TOKEN || !process.env.MONEYBIRD_ADMINISTRATION_ID) return Response.json({ gekoppeld: false })
  // ?soort=offertes: alle offertes (ook concepten) voor het tabblad Offertes in het CRM
  if (new URL(req.url).searchParams.get('soort') === 'offertes') {
    try {
      const { mb } = await import('../lib/moneybird.mts')
      type E = { id: string; estimate_id: string | null; estimate_date: string | null; due_date: string | null; state: string; reference?: string; total_price_excl_tax: string; url?: string; contact_id: string; contact?: { company_name?: string; firstname?: string; lastname?: string } }
      const alle: E[] = []
      for (let page = 1; page <= 10; page++) {
        const rows = await mb<E[]>(`estimates.json?filter=${encodeURIComponent('period:all')}&per_page=100&page=${page}`)
        alle.push(...rows)
        if (rows.length < 100) break
      }
      const offertes = alle.map((e) => ({
        id: e.id,
        nummer: e.estimate_id,
        datum: e.estimate_date,
        geldigTot: e.due_date,
        status: e.state,
        omschrijving: e.reference ?? '',
        bedrag: Number(e.total_price_excl_tax),
        klant: e.contact?.company_name || [e.contact?.firstname, e.contact?.lastname].filter(Boolean).join(' ') || '',
        contactId: e.contact_id,
        url: `https://moneybird.com/${(process.env.MONEYBIRD_ADMINISTRATION_ID ?? '').replace(/\D/g, '')}/estimates/${e.id}`,
      })).sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? ''))
      return Response.json({ gekoppeld: true, offertes })
    } catch (e) {
      return new Response((e as Error).message, { status: 502 })
    }
  }
  const jaar = new URL(req.url).searchParams.get('periode') === 'jaar'
  const periode = jaar ? 'this_year' : 'this_month'
  try {
    const now = new Date()
    const prefix = jaar ? String(now.getFullYear()) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [verkoop, inkoop, bonnen, concept, open, betaald] = await Promise.all([
      lijst('sales_invoices', `period:${periode}`),
      lijst('documents/purchase_invoices', `period:${periode}`),
      lijst('documents/receipts', `period:${periode}`),
      lijst('sales_invoices', 'state:draft'),
      lijst('sales_invoices', 'state:open|late|reminded'),
      lijst('sales_invoices', 'state:paid'),
    ])
    const omzet = som(verkoop.filter((i) => i.state !== 'draft'), 'total_price_excl_tax')
    const kosten = som([...inkoop, ...bonnen], 'total_price_excl_tax')
    const ontvangen = betaald.filter((i) => (i.paid_at ?? '').startsWith(prefix))
    const vandaag = now.toISOString().slice(0, 10)
    const teLaat = open.filter((i) => i.state === 'late' || (i.due_date && i.due_date < vandaag))
    return Response.json({
      gekoppeld: true,
      periode: jaar ? 'jaar' : 'maand',
      bijgewerkt: now.toISOString(),
      omzet,
      kosten,
      winst: Math.round((omzet - kosten) * 100) / 100,
      betalingen: { aantal: ontvangen.length, bedrag: som(ontvangen) },
      concept: { aantal: concept.length, bedrag: som(concept), exBtw: som(concept, 'total_price_excl_tax') },
      open: { aantal: open.length, bedrag: som(open, 'total_unpaid'), teLaat: teLaat.length },
    })
  } catch (e) {
    return new Response((e as Error).message, { status: 502 })
  }
}
