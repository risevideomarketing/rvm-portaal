// Volledige kopie van alles in het dashboard (alle tabellen), voor de nachtelijke back-up, de exportknop en het terugzetscript.
import { sb } from './rise.mts'

/** Tabellen die in de back-up gaan, met hun sleutel (voor terugzetten). */
export const TABELLEN: { naam: string; sleutel: string }[] = [
  { naam: 'tasks', sleutel: 'id' },
  { naam: 'contacts', sleutel: 'id' },
  { naam: 'clients', sleutel: 'id' },
  { naam: 'projects', sleutel: 'id' },
  { naam: 'allowed_users', sleutel: 'email' },
  { naam: 'meta_weekly', sleutel: 'client_id,week_start' },
  { naam: 'sent_notifications', sleutel: 'key' },
]

export interface Backup {
  versie: 1
  gemaakt: string
  tabellen: Record<string, unknown[]>
  aantallen: Record<string, number>
}

export async function maakBackup(): Promise<Backup> {
  const tabellen: Record<string, unknown[]> = {}
  for (const t of TABELLEN) {
    const rijen: unknown[] = []
    for (let van = 0; ; van += 1000) {
      const deel = await sb<unknown[]>(`${t.naam}?select=*`, { headers: { Range: `${van}-${van + 999}`, 'Range-Unit': 'items' } })
      rijen.push(...deel)
      if (deel.length < 1000) break
    }
    tabellen[t.naam] = rijen
  }
  return { versie: 1, gemaakt: new Date().toISOString(), tabellen, aantallen: Object.fromEntries(Object.entries(tabellen).map(([k, v]) => [k, v.length])) }
}

const cel = (v: unknown) => {
  const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = (kop: string[], rijen: unknown[][]) => [kop.join(','), ...rijen.map((r) => r.map(cel).join(','))].join('\n')

/** Leesbare overzichten (spreadsheet), te openen zonder dashboard. */
export function leesbaar(b: Backup) {
  const klantNaam = new Map((b.tabellen.clients as { id: string; data: { name?: string } }[]).map((c) => [c.id, c.data.name ?? '']))
  const contactNaam = new Map((b.tabellen.contacts as { id: string; data: { company?: string } }[]).map((c) => [c.id, c.data.company ?? '']))
  type T = { title: string; status: string; priority: string; assignee: string; deadline: string; clientId?: string; contactId?: string; description?: string; subtasks?: { title: string; done: boolean }[] }
  const taken = csv(
    ['Taak', 'Fase', 'Prioriteit', 'Wie', 'Af vóór', 'Klant of contact', 'Deeltaken', 'Omschrijving'],
    (b.tabellen.tasks as { data: T }[]).map(({ data: t }) => [t.title, t.status, t.priority, t.assignee, t.deadline, klantNaam.get(t.clientId ?? '') || contactNaam.get(t.contactId ?? '') || '', (t.subtasks ?? []).map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`), t.description]),
  )
  type C = { company: string; name: string; role: string; email: string; phone: string; stage: string; value: number; owner: string; source: string; opvolgen?: string; timeline?: { at: string; body: string }[] }
  const crm = csv(
    ['Bedrijf', 'Naam', 'Functie', 'E-mail', 'Telefoon', 'Fase', 'Waarde p.m.', 'Eigenaar', 'Bron', 'Opvolgen op', 'Laatste notitie'],
    (b.tabellen.contacts as { data: C }[]).map(({ data: c }) => [c.company, c.name, c.role, c.email, c.phone, c.stage, c.value, c.owner, c.source, c.opvolgen, c.timeline?.[0] ? `${c.timeline[0].at.slice(0, 10)}: ${c.timeline[0].body}` : '']),
  )
  return { taken, crm }
}
