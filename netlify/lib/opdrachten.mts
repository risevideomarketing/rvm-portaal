// Dagelijkse opdrachten-scan: TenderNed (open API), Freelancer.nl en Hoofdkraan.
// Zet alleen NIEUWE opdrachten in de tabel opdrachten; wat Daan bewaarde of weggooide blijft staan.
// Young Creators laadt alleen in een browser; die komt via de aparte taak op Daans Mac.
import { sb } from './rise.mts'

type Opdracht = {
  id: string; title: string; source: string; url: string; type?: string; client?: string; location?: string
  budget?: string; deadline?: string; posted?: string; found_at: string; relevance: number; status: 'open' | 'bewaard' | 'weg' | 'lead'
}

const vandaag = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
const UA = { 'User-Agent': 'Mozilla/5.0 (Rise opdrachten-scan; +https://risevideomarketing.nl)', Accept: 'text/html,application/json' }
const tekst = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&euro;/g, '€').replace(/&#039;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

// Wat bij Rise past, en wat niet
const VIDEO = /\b(video|videoproductie|videograa?f|film|filmen|bedrijfsfilm|aftermovie|livestream|live-stream|webinar|animatie|motion|montage|editor|editen|content ?creat|social media|reclame|commercial|campagne|fotografie en video|beeldmateriaal|vlog)\w*/i
const NIET = /\b(bruiloft|trouw|huwelijk|verjaardag|priv[eé]|feest|tempel|uitvaart|gratis|onbetaald|stage|vacature|loondienst)\b/i
const STERK = /\b(bedrijfsfilm|videoproductie|campagne|aftermovie|livestream|webinar|reclame|commercial|recruitment|serie|raamovereenkomst)\b/i

function relevantie(t: string, bedrag: number): number {
  if (STERK.test(t) || bedrag >= 1000) return 3
  if (bedrag >= 300 || /\b(bedrijf|zakelijk|organisatie|merk|brand|ads?|socials?)\b/i.test(t)) return 2
  return 1
}
const bedragUit = (b: string) => Math.max(0, ...[...b.replace(/\./g, '').matchAll(/(\d{2,7})/g)].map((m) => Number(m[1])))

async function tenderned(): Promise<Opdracht[]> {
  const uit: Opdracht[] = []
  for (let page = 0; page < 3; page++) {
    const r = await fetch(`https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties?page=${page}&size=100`, { headers: UA })
    if (!r.ok) throw new Error(`TenderNed ${r.status}`)
    const j = (await r.json()) as { content: { publicatieId: string; publicatieDatum: string; typePublicatie?: { code: string }; aanbestedingNaam: string; opdrachtgeverNaam?: string; sluitingsDatum?: string; opdrachtBeschrijving?: string; typeOpdracht?: { code: string } }[] }
    for (const p of j.content ?? []) {
      if (p.typePublicatie?.code !== 'AAO' && p.typePublicatie?.code !== 'VAO') continue
      if (p.typeOpdracht?.code && p.typeOpdracht.code !== 'D') continue
      if (p.sluitingsDatum && p.sluitingsDatum.slice(0, 10) < vandaag()) continue
      const t = `${p.aanbestedingNaam} ${p.opdrachtBeschrijving ?? ''}`
      if (!/\b(video|film|livestream|webinar|audiovisu|fotografie en video|beeld- en geluid|campagne|communicatiebureau|contentcreatie|social media)\w*/i.test(t)) continue
      uit.push({
        id: `tn-${p.publicatieId}`, title: p.aanbestedingNaam.slice(0, 140), source: 'TenderNed', url: `https://www.tenderned.nl/aankondigingen/overzicht/${p.publicatieId}`,
        type: 'Aanbesteding', client: p.opdrachtgeverNaam, budget: 'Zie aankondiging',
        deadline: p.sluitingsDatum ? new Date(p.sluitingsDatum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined,
        posted: new Date(p.publicatieDatum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }), found_at: vandaag(), relevance: 3, status: 'open',
      })
    }
  }
  return uit
}

async function freelancer(): Promise<Opdracht[]> {
  const uit: Opdracht[] = []
  for (const pad of ['video', 'videograaf', 'filmen']) {
    const r = await fetch(`https://freelancer.nl/opdrachten/${pad}`, { headers: UA })
    if (!r.ok) throw new Error(`Freelancer.nl ${r.status}`)
    const html = await r.text()
    for (const blok of html.split('<h4 class="card-title"').slice(1)) {
      const url = blok.match(/document\.location\.href = '(https:\/\/freelancer\.nl\/opdrachten\/[^']+)'/)?.[1] ?? blok.match(/href="(https:\/\/freelancer\.nl\/opdrachten\/[^"]+\/[^"]+\/[^"]+)"/)?.[1]
      const title = tekst(blok.slice(blok.indexOf('>') + 1, blok.indexOf('</h4>')))
      if (!url || !title) continue
      const t = tekst(blok.slice(0, 4000))
      const geleden = t.match(/Geplaatst (\d+) (minuut|minuten|uur|uren|dag|dagen|week|weken|maand|maanden)/)
      const dagen = !geleden ? 0 : /maand/.test(geleden[2]) ? 30 * Number(geleden[1]) : /week/.test(geleden[2]) ? 7 * Number(geleden[1]) : /dag/.test(geleden[2]) ? Number(geleden[1]) : 0
      if (dagen > 30 || NIET.test(t) || !VIDEO.test(t)) continue
      const budget = t.match(/€\s?[\d.,]+\s?—\s?€\s?[\d.,]+(?: Per Uur)?|€\s?[\d.,]+(?: Per Uur)?/)?.[0]?.replace(' Per Uur', ' p/u') ?? 'In overleg'
      const plaats = url.split('/')[4]?.replace(/-/g, ' ')
      uit.push({
        id: `fl-${url.split('-').pop()}`, title: title.slice(0, 140), source: 'Freelancer.nl', url, type: 'Video',
        location: plaats ? plaats[0].toUpperCase() + plaats.slice(1) : undefined, budget,
        posted: geleden ? `${geleden[1]} ${geleden[2]} geleden` : undefined, found_at: vandaag(), relevance: relevantie(t, bedragUit(budget)), status: 'open',
      })
    }
  }
  return uit
}

async function hoofdkraan(): Promise<Opdracht[]> {
  const uit: Opdracht[] = []
  const r = await fetch('https://www.hoofdkraan.nl/opdrachten/design-en-multimedia/film-en-video', { headers: UA })
  if (!r.ok) throw new Error(`Hoofdkraan ${r.status}`)
  const html = await r.text()
  for (const blok of html.split('newContentBox projectResult').slice(1)) {
    const m = blok.match(/href="(https:\/\/www\.hoofdkraan\.nl\/j\/[^"]+\/(\d+))"[^>]*>([\s\S]*?)<\/a>/)
    if (!m) continue
    const t = tekst(blok.slice(0, 5000))
    if (!/Status:\s*Open/i.test(t) || NIET.test(t)) continue
    const budget = t.match(/Budget:\s*([^]*?)\s+Geplaatst:/)?.[1]?.trim() ?? 'In overleg'
    const posted = t.match(/Geplaatst:\s*(\d{1,2} \w{3})/)?.[1]
    const locatie = t.match(/Locatie:\s*(.*?)\s+(?:Laatst gewijzigd|Status):/)?.[1]
    uit.push({
      id: `hk-${m[2]}`, title: tekst(m[3]).slice(0, 140), source: 'Hoofdkraan', url: m[1], type: 'Video',
      location: locatie, budget, posted, found_at: vandaag(), relevance: relevantie(t, bedragUit(budget)), status: 'open',
    })
  }
  return uit
}

/** Scan alle bronnen en zet nieuwe opdrachten in de tabel. Ruimt oude open/weg-opdrachten (30+ dagen) op. */
export async function scanOpdrachten() {
  const bestaand = await sb<{ id: string; data: Opdracht }[]>('opdrachten?select=id,data')
  const ids = new Set(bestaand.map((r) => r.id))
  const urls = new Set(bestaand.map((r) => r.data?.url).filter(Boolean))
  const fouten: string[] = []
  const gevonden: Opdracht[] = []
  for (const [naam, f] of [['TenderNed', tenderned], ['Freelancer.nl', freelancer], ['Hoofdkraan', hoofdkraan]] as const) {
    try { gevonden.push(...(await f())) } catch (e) { fouten.push(`${naam}: ${(e as Error).message}`) }
  }
  const nieuw = [...new Map(gevonden.filter((o) => !ids.has(o.id) && !urls.has(o.url)).map((o) => [o.id, o])).values()]
  if (nieuw.length) {
    const nu = new Date().toISOString()
    await sb('opdrachten', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(nieuw.map((o) => ({ id: o.id, data: o, updated_at: nu }))) })
  }
  // Opruimen: open of weggegooid en ouder dan 30 dagen (bewaard en leads blijven altijd)
  const grens = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const oud = bestaand.filter((r) => (r.data?.status === 'open' || r.data?.status === 'weg') && (r.data?.found_at ?? '9') < grens).map((r) => r.id)
  if (oud.length) await sb(`opdrachten?id=in.(${oud.map((i) => `"${i}"`).join(',')})`, { method: 'DELETE' })
  return { nieuw: nieuw.length, titels: nieuw.map((o) => `${o.source}: ${o.title}`), opgeruimd: oud.length, fouten }
}
