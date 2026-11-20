// Elke maandag om 07:00 (Nederlandse tijd): weekoverzicht van de Meta-campagnes per klant (maandag t/m zondag ervoor).
// Klanten zien in hun portaal alleen dit weekoverzicht, niet live.
// Het schema staat in UTC op 05:00 en 06:00; alleen de run die in Nederland om 07:00 valt doet iets (zomer- en wintertijd).
import { klantenMetMeta, maakWeekoverzicht, metaGekoppeld } from '../lib/meta.mts'

export default async () => {
  const uur = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false }).format(new Date()))
  if (uur !== 7) return new Response(`Overgeslagen: het is ${uur}:00 in Nederland`)
  if (!metaGekoppeld()) return new Response('META_ACCESS_TOKEN ontbreekt')

  const gelukt: string[] = []
  const fouten: string[] = []
  for (const k of await klantenMetMeta()) {
    try {
      await maakWeekoverzicht(k.id, k.account)
      gelukt.push(k.id)
    } catch (e) {
      fouten.push(`${k.id}: ${(e as Error).message}`)
    }
  }
  console.log(JSON.stringify({ gelukt, fouten }))
  return Response.json({ gelukt, fouten })
}

export const config = { schedule: '0 5,6 * * 1' }
