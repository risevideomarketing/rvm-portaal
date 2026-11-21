// Elke nacht: nieuwe Moneybird-facturen als pdf in het dossier van de klant zetten.
import { moneybirdGekoppeld } from '../lib/moneybird.mts'
import { facturenNaarDossiers } from '../lib/facturen.mts'

export default async () => {
  if (!moneybirdGekoppeld()) return new Response('Moneybird niet gekoppeld')
  const r = await facturenNaarDossiers({ max: 20 })
  console.log(JSON.stringify({ gedaan: r.gedaan, resterend: r.resterend }))
  return new Response('ok')
}

export const config = { schedule: '30 2 * * *' }
