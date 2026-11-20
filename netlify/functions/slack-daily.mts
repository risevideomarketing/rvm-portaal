// Elke ochtend om 9:00 (Nederlandse wintertijd; 10:00 in de zomer):
// - deadline morgen om 18:00 (taak "af vóór" overmorgen) → DM aan wie de taak heeft
// - gestart en 24 werkuren geen update → DM aan de eigenaar
// - contact met "Opvolgen op" vandaag → DM aan de eigenaar van het contact (geen taak nodig)
// Elke melding gaat maar één keer (tabel sent_notifications).
// Daarna: alle deadlines opnieuw naar de Rise-agenda (Google Agenda).
import { agendaGekoppeld, syncTaak } from '../lib/agenda.mts'
import { SITE, claim, contactRows, dateNL, dm, names, taskLink, tasks, team, werkurenSinds } from '../lib/rise.mts'

export default async () => {
  const [all, emails, clients, contacts] = await Promise.all([tasks(), team(), names('clients'), names('contacts')])
  const morgen = dateNL(1)
  const overmorgen = dateNL(2) // af vóór overmorgen = deadline morgen om 18:00
  const sent: string[] = []
  const errors: string[] = []

  for (const t of all) {
    if (t.status === 'klaar' || (t.projectId && !t.inTodo)) continue // projecttaken alleen als ze op de to-do lijst staan
    const wie = clients.get(t.clientId ?? '') || contacts.get(t.contactId ?? '')
    try {
      if (t.deadline === overmorgen && (await claim(`deadline:${t.id}:${t.deadline}`))) {
        await dm(t.assignee, `:alarm_clock: Morgen om 18:00 deadline: *${taskLink(t)}*${wie ? ` (${wie})` : ''}.`, emails, 'deadline')
        sent.push(`deadline ${t.id}`)
      }
      const sinds = t.updatedAt ?? t.startedAt
      if (t.status === 'bezig' && t.startedAt && sinds && werkurenSinds(sinds) >= 24 && (await claim(`stil:${t.id}:${sinds}`))) {
        await dm(t.assignee, `:hourglass: Je bent gestart met *${taskLink(t)}*, maar er is al ${werkurenSinds(sinds)} werkuur niets bijgewerkt. Vink een deeltaak af of laat weten waar het op vastzit.`, emails, 'stil')
        sent.push(`stil ${t.id}`)
      }
    } catch (e) {
      errors.push(`${t.id}: ${(e as Error).message}`)
    }
  }

  // Opvolgen: contacten die vandaag opnieuw benaderd moeten worden
  const vandaag = dateNL(0)
  try {
    for (const c of await contactRows()) {
      if (c.opvolgen !== vandaag || !(await claim(`opvolgen:${c.id}:${c.opvolgen}`))) continue
      const laatste = c.timeline?.[0]?.body?.replace(/\s+/g, ' ').slice(0, 280)
      await dm(c.owner, `:bell: Vandaag opvolgen: *<${SITE}/#/crm|${c.company}>*${c.name ? ` (${c.name})` : ''}.${laatste ? `\n>${laatste}` : ''}`, emails, 'opvolgen')
      sent.push(`opvolgen ${c.id}`)
    }
  } catch (e) {
    errors.push(`opvolgen: ${(e as Error).message}`)
  }

  // Alle deadlines nog een keer naar de Rise-agenda, voor wijzigingen die buiten het dashboard om gingen
  let agenda = 0
  if (agendaGekoppeld()) {
    for (const t of all) {
      try {
        if ((await syncTaak(t, clients.get(t.clientId ?? '') || contacts.get(t.contactId ?? ''))) !== 'niets') agenda++
      } catch (e) {
        errors.push(`agenda ${t.id}: ${(e as Error).message}`)
      }
    }
  }

  console.log(JSON.stringify({ morgen, sent, agenda, errors }))
  return new Response(JSON.stringify({ morgen, sent, agenda, errors }), { headers: { 'Content-Type': 'application/json' } })
}

export const config = { schedule: '0 8 * * *' }
