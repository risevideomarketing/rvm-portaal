// Elke ochtend (06:15): nieuwe opdrachten van TenderNed, Freelancer.nl en Hoofdkraan in de app zetten.
import { scanOpdrachten } from '../lib/opdrachten.mts'

export default async () => {
  const r = await scanOpdrachten()
  console.log(JSON.stringify(r))
  return new Response('ok')
}

export const config = { schedule: '15 5 * * *' }
