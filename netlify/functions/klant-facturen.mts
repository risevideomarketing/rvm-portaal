// Facturen van één klant uit Moneybird, voor het klantportaal.
// Klant: alleen de eigen facturen. Team (admin/sales): ?klant=<id> voor de voorvertoning en het dossier.
// Koppeling: client.moneybirdContactId; leeg = zoeken op bedrijfsnaam in Moneybird-contacten.
// Nooit concepten. Per factuur de openbare Moneybird-link (bekijken, downloaden, betalen).
import { env, heeftRecht, sb, klantMagGeld, verifyAny } from '../lib/rise.mts'
import { mb } from '../lib/moneybird.mts'
import { contactenVan } from '../lib/facturen.mts'

interface Factuur { invoice_id: string | null; invoice_date: string | null; due_date: string | null; total_price_incl_tax: string; total_unpaid: string; state: string; url?: string; contact_id: string; currency?: string }


export default async (req: Request) => {
  const me = await verifyAny(req.headers.get('x-supabase-token'))
  if (!me) return new Response('Niet ingelogd', { status: 401 })
  const team = ['admin', 'medewerker', 'sales'].includes(me.role)
  if (team && !(await heeftRecht(me.person ?? '', me.role, 'geld'))) return new Response('Geen toegang tot facturen', { status: 403 })
  if (!team && me.client_id && !(await klantMagGeld(me.client_id, me.email))) return new Response('Geen toegang tot facturen', { status: 403 })
  const clientId = me.client_id ?? (team ? new URL(req.url).searchParams.get('klant') : null)
  if (!clientId) return new Response('Klant ontbreekt', { status: 400 })
  const [rij] = await sb<{ data: { name?: string; moneybirdContactId?: string; moneybirdContactIds?: string[]; offertePdfs?: { id: string; naam: string; pad: string; at: string; titel?: string }[] } }[]>(`clients?select=data&id=eq.${encodeURIComponent(clientId)}`)
  if (!rij) return new Response('Klant niet gevonden', { status: 404 })
  const offertesVraag = new URL(req.url).searchParams.get('soort') === 'offertes'

  // Pdf-offertes die Rise in het dossier uploadde: tijdelijke link (1 uur) per pdf
  const pdfOffertes = async () => {
    const uit: { nummer: string; datum: string | null; geldigTot: null; bedrag: null; omschrijving: string; status: 'pdf'; url?: string }[] = []
    for (const b of rij.data.offertePdfs ?? []) {
      if (!b.pad?.startsWith(`klant/${clientId}/offertes/`)) continue
      const r = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/sign/bestanden/${b.pad.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }),
      })
      const j = r.ok ? ((await r.json()) as { signedURL?: string }) : {}
      uit.push({ nummer: b.id, datum: b.at?.slice(0, 10) ?? null, geldigTot: null, bedrag: null, omschrijving: b.titel || b.naam.replace(/\.pdf$/i, ''), status: 'pdf', url: j.signedURL ? `${env('SUPABASE_URL')}/storage/v1${j.signedURL}` : undefined })
    }
    return uit
  }

  if (!process.env.MONEYBIRD_TOKEN || !process.env.MONEYBIRD_ADMINISTRATION_ID) return Response.json(offertesVraag ? { gekoppeld: false, offertes: await pdfOffertes() } : { gekoppeld: false, facturen: [] })

  try {
    const contacten = await contactenVan(rij.data)
    const contactId = contacten[0]
    const contactNaam: string | undefined = undefined
    if (!contactId) return Response.json({ gekoppeld: true, contact: null, facturen: [], offertes: offertesVraag ? await pdfOffertes() : [] })

    // Offertes (?soort=offertes): pdf's uit het dossier plus Moneybird, alles behalve concepten en gearchiveerde
    if (offertesVraag) {
      type Offerte = { estimate_id: string | null; estimate_date: string | null; due_date: string | null; total_price_excl_tax: string; state: string; url?: string; contact_id: string; reference?: string }
      const rows: Offerte[] = []
      for (const c of contacten) rows.push(...(await mb<Offerte[]>(`estimates.json?filter=${encodeURIComponent(`contact_id:${c},state:open|late|accepted|rejected|billed`)}&per_page=100`)))
      const offertes = rows
        .filter((o) => contacten.includes(o.contact_id) && o.estimate_id && o.state !== 'draft')
        .map((o) => ({ nummer: o.estimate_id, datum: o.estimate_date, geldigTot: o.due_date, bedrag: Number(o.total_price_excl_tax), omschrijving: o.reference ?? '', status: o.state === 'accepted' || o.state === 'billed' ? 'akkoord' : o.state === 'rejected' ? 'afgewezen' : o.state === 'late' ? 'verlopen' : 'open', url: o.url }))
      const alle = [...(await pdfOffertes()), ...offertes].sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? ''))
      return Response.json({ gekoppeld: true, offertes: alle })
    }

    const alle: Factuur[] = []
    for (const c of contacten) {
      for (let page = 1; page <= 10; page++) {
        const rows = await mb<Factuur[]>(`sales_invoices.json?filter=${encodeURIComponent(`contact_id:${c},state:open|pending_payment|reminded|late|paid`)}&per_page=100&page=${page}`)
        alle.push(...rows)
        if (rows.length < 100) break
      }
    }
    const vandaag = new Date().toISOString().slice(0, 10)
    const facturen = alle
      .filter((f) => contacten.includes(f.contact_id) && f.state !== 'draft' && f.invoice_id)
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
