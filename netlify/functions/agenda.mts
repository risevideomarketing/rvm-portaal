// Deadlines van taken naar de gedeelde Rise-agenda (Google Agenda).
// Het dashboard roept dit aan na elke wijziging aan taken (POST { ids }); de ochtendrun (slack-daily) loopt alles nog een keer na.
// Alleen het team. De taken zelf leest de functie uit Supabase, niet uit het verzoek.
import { agendaGekoppeld, syncTaak, wegTaak } from '../lib/agenda.mts'
import { names, sb, verifyUser, type TaskRow } from '../lib/rise.mts'

export default async (req: Request) => {
  const me = await verifyUser(req.headers.get('x-supabase-token'))
  if (!me) return new Response('Alleen het team', { status: 401 })
  if (!agendaGekoppeld()) return Response.json({ gekoppeld: false })
  const body = ((await req.json().catch(() => ({}))) ?? {}) as { ids?: string[]; weg?: string[] }
  const lijst = (body.ids ?? []).filter((x) => /^[\w-]{1,80}$/.test(x)).slice(0, 50)
  const uit = { gekoppeld: true, gezet: [] as string[], weg: [] as string[], fouten: [] as string[] }

  // Verwijderde taken: alleen als ze echt niet meer in de database staan
  const wegLijst = (body.weg ?? []).filter((x) => /^[\w-]{1,80}$/.test(x)).slice(0, 50)
  if (wegLijst.length) {
    const nogDaar = new Set((await sb<{ id: string }[]>(`tasks?select=id&id=in.(${wegLijst.map((x) => `"${x}"`).join(',')})`)).map((r) => r.id))
    for (const id of wegLijst.filter((x) => !nogDaar.has(x))) {
      try {
        if (await wegTaak(id)) uit.weg.push(id)
      } catch (e) {
        uit.fouten.push(`${id}: ${(e as Error).message}`)
      }
    }
  }
  if (!lijst.length) return Response.json(uit)

  const rows = await sb<{ id: string; data: TaskRow }[]>(`tasks?select=id,data&id=in.(${lijst.map((x) => `"${x}"`).join(',')})`)
  const [clients, contacts] = await Promise.all([names('clients'), names('contacts')])
  for (const { id, data: t } of rows) {
    try {
      const r = await syncTaak(t, clients.get(t.clientId ?? '') || contacts.get(t.contactId ?? ''))
      if (r === 'gezet') uit.gezet.push(id)
      if (r === 'weg') uit.weg.push(id)
    } catch (e) {
      uit.fouten.push(`${id}: ${(e as Error).message}`)
    }
  }
  if (uit.fouten.length) console.error(JSON.stringify(uit.fouten))
  return Response.json(uit)
}
