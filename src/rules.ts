// Automatische regels. In de echte versie draait dit als geplande Netlify Function (elk uur),
// nadat de mailboxen van Lars en Daan zijn uitgelezen.
import type { Contact, PersonId, Task } from './data/types'
import { TODAY, daysUntil } from './utils'

export const REMINDER_NA_DAGEN = 5
const VOORSTEL = /voorstel|offerte|propos/i

/**
 * Voorstel verstuurd en na 5 dagen geen mail terug van het contact? Dan een reminder-taak
 * voor degene die het voorstel stuurde. Eén reminder per verstuurde voorstelmail.
 */
export function proposalReminders(contacts: Contact[], tasks: Task[]): Task[] {
  const out: Task[] = []
  for (const c of contacts) {
    if (c.stage === 'klant' || c.stage === 'extra') continue
    const sent = c.timeline
      .filter((t) => t.kind === 'mail-uit' && VOORSTEL.test(`${t.subject ?? ''} ${t.body}`))
      .sort((a, b) => b.at.localeCompare(a.at))[0]
    if (!sent) continue
    const replied = c.timeline.some((t) => (t.kind === 'mail-in' || t.kind === 'whatsapp' || t.kind === 'gesprek') && t.at > sent.at)
    const dagen = -daysUntil(sent.at.slice(0, 10))
    const key = `reminder:${sent.id}`
    if (replied || dagen < REMINDER_NA_DAGEN || tasks.some((t) => t.auto === key)) continue
    out.push({
      id: key,
      auto: key,
      title: `Reminder: geen reactie op voorstel ${c.company} (${dagen} dagen)`,
      description: `Voorstel "${sent.subject ?? 'zonder onderwerp'}" verstuurd op ${new Date(sent.at).toLocaleDateString('nl-NL')}. Sindsdien geen mail terug. Bellen of een korte opvolgmail sturen.`,
      priority: 'hoog',
      soort: 'Sales',
      deadline: TODAY.toISOString().slice(0, 10),
      assignee: sent.author ?? c.owner,
      status: 'todo',
      contactId: c.id,
      inAgenda: true,
      comments: [],
      subtasks: suggestSubtasks('opvolgen', c.company).map((title, i) => ({ id: `${key}:${i}`, title, done: false })),
      subtasksConfirmed: false,
    })
  }
  return out
}

// ── Deeltaken ────────────────────────────────────────────────────────────────
// Prototype: vaste sjablonen op trefwoord. Echte versie: Claude (via Netlify Function)
// stelt deeltaken voor op basis van de titel, de klant en de SOP's uit de kennisbank.

const TEMPLATES: { match: RegExp; steps: (x: string, w?: string) => string[] }[] = [
  { match: /voorstel|offerte/i, steps: (x, w = 'voorstel') => [`Onderzoek huidige situatie ${x}`, `Rauw${w === 'offerte' ? 'e' : ''} ${w} ${x} af`, `Opgemaakt${w === 'offerte' ? 'e' : ''} ${w} af en in Slack ter feedback`, `${w[0].toUpperCase() + w.slice(1)} goedgekeurd en opgestuurd naar ${x}`] },
  { match: /shoot/i, steps: () => ['Scripts en shotlist maken', 'Akkoord klant op scripts', 'Locatie en mensen bevestigen', 'Shootdag gedraaid', 'Beeldmateriaal veiliggesteld'] },
  { match: /video|edit|montage|versie|frame/i, steps: () => ['Ruwe edit', 'Eerste versie in Frame.io', 'Feedback verwerkt', 'Definitieve export in alle formaten'] },
  { match: /campagne|doelgroep|ads|advertentie/i, steps: () => ['Doelgroepen en uitsluitingen bepalen', 'Advertenties en teksten klaarzetten', 'Tracking getest', 'Campagne live en eerste check gedaan'] },
  { match: /rapport/i, steps: () => ['Cijfers ophalen', 'Conclusies en volgende stappen geschreven', 'Rapport verstuurd'] },
  { match: /kick-off|afspraak|gesprek|plannen|inplannen/i, steps: (x) => [`Datum prikken met ${x}`, 'Agenda en vragen voorbereiden', 'Gesprek gevoerd', 'Afspraken vastgelegd in het dashboard'] },
  { match: /opvolg|reminder|bellen/i, steps: (x) => [`${x} gebeld of gemaild`, 'Reactie vastgelegd in de CRM', 'Volgende stap ingepland'] },
]

export function suggestSubtasks(title: string, context?: string): string[] {
  const x = context || title.replace(/^(voorstel|offerte|kick-off|reminder:?)\s*/i, '').replace(/\s*\(.*\)$/, '').trim() || 'de klant'
  const tpl = TEMPLATES.find((t) => t.match.test(title))
  return tpl ? tpl.steps(x, /offerte/i.test(title) ? 'offerte' : 'voorstel') : ['Uitzoeken wat er nodig is', 'Uitvoeren', 'Laten checken door een collega', 'Afronden en vastleggen']
}

// ── Werkuren en "geen update"-melding ────────────────────────────────────────

export const STIL_NA_WERKUREN = 24

/** Telt alleen uren op werkdagen (ma t/m vr). Vrijdag gestart → telt het weekend niet mee. */
export function werkurenSinds(iso: string, now: Date = new Date()): number {
  let t = new Date(iso).getTime()
  const end = now.getTime()
  let hours = 0
  while (t < end) {
    const step = Math.min(3600000, end - t)
    const day = new Date(t).getDay()
    if (day !== 0 && day !== 6) hours += step / 3600000
    t += step
  }
  return Math.floor(hours)
}

export function isStil(t: Task, now: Date = new Date()) {
  return t.status === 'bezig' && !!t.startedAt && werkurenSinds(t.updatedAt ?? t.startedAt, now) >= STIL_NA_WERKUREN
}

// ── Slack-meldingen ──────────────────────────────────────────────────────────
// Prototype toont wat er verstuurd zou worden. Echte versie: Slack-app met bot-token,
// DM via chat.postMessage, gebruiker gezocht op e-mailadres.

export interface Melding {
  id: string
  to: PersonId | 'kanaal'
  kind: 'stil' | 'reminder' | 'tag' | 'feedback' | 'deeltaken'
  at: string
  text: string
  taskId?: string
}

export function meldingen(tasks: Task[], team: { id: PersonId; name: string }[], now: Date = new Date()): Melding[] {
  const out: Melding[] = []
  for (const t of tasks) {
    if (isStil(t, now)) {
      out.push({ id: `stil:${t.id}`, to: t.assignee, kind: 'stil', at: now.toISOString(), taskId: t.id,
        text: `Je bent ${new Date(t.startedAt!).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' })} gestart met *${t.title}*, maar er is al ${werkurenSinds(t.updatedAt ?? t.startedAt!, now)} werkuur niets bijgewerkt. Vink een deeltaak af of laat weten waar het op vastzit.` })
    }
    if (t.auto && t.status !== 'klaar') {
      out.push({ id: `rem:${t.id}`, to: t.assignee, kind: 'reminder', at: now.toISOString(), taskId: t.id, text: `${t.title}. Staat als taak met prioriteit hoog in het dashboard.` })
    }
    if (t.subtasks && !t.subtasksConfirmed && t.status !== 'klaar') {
      out.push({ id: `sub:${t.id}`, to: t.assignee, kind: 'deeltaken', at: now.toISOString(), taskId: t.id, text: `Nieuwe taak *${t.title}*. Ik heb ${t.subtasks.length} deeltaken voorgesteld. Klopt dit? Bevestig of pas aan in het dashboard.` })
    }
    for (const st of t.subtasks ?? []) {
      if (st.done && /in slack ter feedback/i.test(st.title) && st.doneBy) {
        out.push({ id: `fb:${st.id}`, to: 'kanaal', kind: 'feedback', at: st.doneAt ?? now.toISOString(), taskId: t.id, text: `${team.find((p) => p.id === st.doneBy)?.name} vraagt feedback op *${t.title}*.` })
      }
    }
    for (const c of t.comments) {
      for (const p of team) {
        if (p.id !== c.author && new RegExp(`@${p.name}(?![a-z])`, 'i').test(c.text)) {
          out.push({ id: `tag:${c.id}:${p.id}`, to: p.id, kind: 'tag', at: c.at, taskId: t.id, text: `${team.find((x) => x.id === c.author)?.name} tagde je bij *${t.title}*: "${c.text}"` })
        }
      }
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}
