// Facturen uit Moneybird als pdf in het dossier van elke klant (client.bestanden, map klant/<id>/facturen/).
// Idempotent: een factuur die er al staat (id mb-<moneybird id>) wordt overgeslagen. Werkt in porties,
// zodat één aanroep binnen de tijdslimiet blijft; de rest volgt bij de volgende aanroep.
import { mb } from './moneybird.mts'
import { sb } from './rise.mts'

interface Contact { id: string; company_name?: string }
interface Factuur { id: string; invoice_id: string | null; invoice_date: string | null; contact_id: string; state: string }
interface Bestand { id: string; naam: string; pad: string; type: string; grootte: number; at: string; by?: string }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Moneybird-contact van een klant: vaste koppeling, anders een eenduidige naam-match (liever niets dan andermans facturen). */
export async function contactVan(klant: { name?: string; moneybirdContactId?: string }): Promise<string | undefined> {
  if (klant.moneybirdContactId?.trim()) return klant.moneybirdContactId.trim()
  if (!klant.name) return undefined
  const gevonden = await mb<Contact[]>(`contacts.json?query=${encodeURIComponent(klant.name)}&per_page=10`)
  const exact = gevonden.filter((c) => norm(c.company_name ?? '') === norm(klant.name!))
  return (exact.length === 1 ? exact[0] : gevonden.length === 1 ? gevonden[0] : undefined)?.id
}

async function pdfOpslaan(pad: string, buf: ArrayBuffer) {
  const sleutel = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const auth = sleutel.startsWith('eyJ') ? { Authorization: `Bearer ${sleutel}` } : {}
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/bestanden/${pad.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { apikey: sleutel, ...auth, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: buf,
  })
  if (!r.ok) throw new Error(`Opslaan ${pad}: ${r.status} ${(await r.text()).slice(0, 120)}`)
}

async function pdfVan(factuurId: string): Promise<ArrayBuffer> {
  const r = await fetch(`https://moneybird.com/api/v2/${(process.env.MONEYBIRD_ADMINISTRATION_ID ?? '').replace(/\D/g, '')}/sales_invoices/${factuurId}/download_pdf`, {
    headers: { Authorization: `Bearer ${(process.env.MONEYBIRD_TOKEN ?? '').trim().replace(/^Bearer\s+/i, '').replace(/[^!-~]/g, '')}` },
  })
  if (!r.ok) throw new Error(`Pdf ${factuurId}: Moneybird ${r.status}`)
  return r.arrayBuffer()
}

export async function facturenNaarDossiers(opties: { klant?: string; max?: number } = {}) {
  const max = Math.min(opties.max ?? 12, 40)
  const filter = opties.klant ? `&id=eq.${encodeURIComponent(opties.klant)}` : ''
  const klanten = await sb<{ id: string; data: Record<string, any> }[]>(`clients?select=id,data${filter}`)
  let gedaan = 0
  let resterend = 0
  const verslag: { klant: string; contact: boolean; nieuw: number; totaal: number; fout?: string }[] = []

  for (const k of klanten) {
    const naam = k.data.name ?? k.id
    try {
      const contact = await contactVan(k.data)
      if (!contact) { verslag.push({ klant: naam, contact: false, nieuw: 0, totaal: 0 }); continue }
      const alle: Factuur[] = []
      for (let page = 1; page <= 10; page++) {
        const rows = await mb<Factuur[]>(`sales_invoices.json?filter=${encodeURIComponent(`contact_id:${contact},state:open|pending_payment|reminded|late|paid|uncollectible`)}&per_page=100&page=${page}`)
        alle.push(...rows)
        if (rows.length < 100) break
      }
      const facturen = alle.filter((f) => f.contact_id === contact && f.invoice_id && f.state !== 'draft')
      const bestanden: Bestand[] = [...(k.data.bestanden ?? [])]
      const al = new Set(bestanden.map((b) => b.id))
      const todo = facturen.filter((f) => !al.has(`mb-${f.id}`))
      let nieuw = 0
      for (const f of todo) {
        if (gedaan >= max) { resterend++; continue }
        const bestandsnaam = `Factuur ${f.invoice_id}.pdf`
        const pad = `klant/${k.id}/facturen/${bestandsnaam}`
        const buf = await pdfVan(f.id)
        await pdfOpslaan(pad, buf)
        bestanden.push({ id: `mb-${f.id}`, naam: bestandsnaam, pad, type: 'application/pdf', grootte: buf.byteLength, at: f.invoice_date ? `${f.invoice_date}T12:00:00.000Z` : new Date().toISOString() })
        gedaan++
        nieuw++
      }
      if (nieuw) {
        // Opnieuw lezen vlak voor het opslaan, zodat wijzigingen van intussen niet verloren gaan
        const [vers] = await sb<{ data: Record<string, any> }[]>(`clients?select=data&id=eq.${encodeURIComponent(k.id)}`)
        const bestaand: Bestand[] = vers?.data?.bestanden ?? []
        const ids = new Set(bestaand.map((b) => b.id))
        const data = { ...(vers?.data ?? k.data), bestanden: [...bestaand, ...bestanden.filter((b) => !ids.has(b.id))] }
        await sb('clients', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: k.id, data, updated_at: new Date().toISOString() }) })
      }
      verslag.push({ klant: naam, contact: true, nieuw, totaal: facturen.length })
    } catch (e) {
      verslag.push({ klant: naam, contact: true, nieuw: 0, totaal: 0, fout: (e as Error).message.slice(0, 160) })
    }
  }
  return { gedaan, resterend, verslag }
}
