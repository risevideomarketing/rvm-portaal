// Toegang voor de eigen Claude van Lars en Daan: taken, CRM en klanttaken toevoegen zonder browser.
// Aanroepen met header "Authorization: Bearer <persoonlijke sleutel>" (zie scripts/rise.mjs).
// In Netlify staat alleen de hash van elke sleutel: CLAUDE_SLEUTELS = "lars:<sha256>,daan:<sha256>".
// Elke wijziging komt op naam van die persoon binnen en gaat (bij taken) gewoon naar de agenda.
//
// GET  ?wat=taken|klanten|contacten           → overzicht (om de juiste klant of taak te vinden)
// POST { actie: 'taak', titel, klant?, deadline?, prioriteit?, soort?, wie?, omschrijving?, deeltaken?: string[] }
// POST { actie: 'deeltaak-af', taak, deeltaak }
// POST { actie: 'contact', bedrijf, naam?, email?, telefoon?, fase?, bron?, website? }
// POST { actie: 'notitie', contact, tekst, soort? }       soort: notitie | gesprek | whatsapp | mail-in | mail-uit
// POST { actie: 'opvolgen', contact, datum }
// POST { actie: 'klanttaak', klant, titel, deadline?, toelichting? }
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { agendaGekoppeld, syncTaak } from '../lib/agenda.mts'
import { sb } from '../lib/rise.mts'
import { standaardAfVoor, verdeelDeadlines } from '../../src/utils.ts'

type Json = Record<string, unknown>
interface Rij<T> { id: string; data: T }
interface Klant { id: string; name: string; contactId?: string; klantTaken?: Json[] }
interface Contact { id: string; company: string; name: string; stage: string; timeline: Json[]; opvolgen?: string; [k: string]: unknown }
interface Taak { id: string; title: string; status: string; assignee: string; deadline: string; clientId?: string; contactId?: string; subtasks?: { id: string; title: string; done: boolean; doneAt?: string; doneBy?: string; deadline?: string }[]; subtasksConfirmed?: boolean; [k: string]: unknown }

const id = () => randomUUID().replace(/-/g, '').slice(0, 10)
const nu = () => new Date().toISOString()
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const fout = (tekst: string, status = 400) => new Response(tekst, { status })
const DATUM = /^\d{4}-\d{2}-\d{2}$/

/** Wie roept aan? Vergelijkt de hash van de sleutel met CLAUDE_SLEUTELS (tijd-constant). */
function persoonVan(req: Request): string | null {
  const sleutel = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (sleutel.length < 32) return null
  const hash = createHash('sha256').update(sleutel).digest()
  for (const deel of (process.env.CLAUDE_SLEUTELS ?? '').split(',')) {
    const [persoon, hex] = deel.trim().split(':')
    if (!persoon || !/^[0-9a-f]{64}$/i.test(hex ?? '')) continue
    if (timingSafeEqual(hash, Buffer.from(hex, 'hex'))) return persoon
  }
  return null
}

/** Eén eenduidige match op naam (exact, anders "bevat"); anders een duidelijke fout met de kandidaten. */
function vind<T>(lijst: T[], zoek: string, naam: (x: T) => string, wat: string): T {
  const z = norm(zoek)
  const exact = lijst.filter((x) => norm(naam(x)) === z)
  if (exact.length === 1) return exact[0]
  const deels = lijst.filter((x) => norm(naam(x)).includes(z))
  if (deels.length === 1) return deels[0]
  const kandidaten = (deels.length ? deels : lijst).slice(0, 8).map(naam).join(', ')
  throw new Error(deels.length > 1 ? `Meerdere ${wat} passen bij "${zoek}": ${kandidaten}. Wees specifieker.` : `Geen ${wat} gevonden voor "${zoek}". Wel: ${kandidaten}`)
}

const schrijf = (tabel: string, rij: { id: string; data: unknown }) =>
  sb(tabel, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ ...rij, updated_at: nu(), updated_by: null }) })

export default async (req: Request) => {
  const persoon = persoonVan(req)
  if (!persoon) return fout('Onbekende of ontbrekende sleutel', 401)
  try {
    if (req.method === 'GET') {
      const wat = new URL(req.url).searchParams.get('wat') ?? 'taken'
      if (wat === 'klanten') return Response.json((await sb<Rij<Klant>[]>('clients?select=id,data')).map((r) => ({ id: r.id, naam: r.data.name })))
      if (wat === 'projecten') return Response.json((await sb<Rij<{ name: string; soort?: string; clientId?: string; fase?: string }>[]>('projects?select=id,data')).map((r) => ({ id: r.id, naam: r.data.name, soort: r.data.soort === 'productie' ? 'productie' : 'intern', klant: r.data.clientId, fase: r.data.fase })))
      if (wat === 'contacten') return Response.json((await sb<Rij<Contact>[]>('contacts?select=id,data')).map((r) => ({ id: r.id, bedrijf: r.data.company, naam: r.data.name, fase: r.data.stage, opvolgen: r.data.opvolgen })))
      const taken = await sb<Rij<Taak>[]>('tasks?select=id,data')
      return Response.json(taken.filter((r) => r.data.status !== 'klaar').map((r) => ({ id: r.id, titel: r.data.title, wie: r.data.assignee, deadline: r.data.deadline, status: r.data.status, deeltaken: (r.data.subtasks ?? []).map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`) })))
    }
    if (req.method !== 'POST') return fout('Alleen GET of POST', 405)
    const b = ((await req.json().catch(() => null)) ?? {}) as Json
    const tekst = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '')

    switch (b.actie) {
      case 'taak': {
        const titel = tekst('titel')
        if (!titel) return fout('titel ontbreekt')
        let clientId: string | undefined
        let contactId: string | undefined
        if (tekst('klant')) {
          const klanten = await sb<Rij<Klant>[]>('clients?select=id,data')
          const contacten = await sb<Rij<Contact>[]>('contacts?select=id,data')
          const alle = [...klanten.map((k) => ({ soort: 'klant', id: k.id, naam: k.data.name, contactId: k.data.contactId })), ...contacten.filter((c) => !klanten.some((k) => k.data.contactId === c.id)).map((c) => ({ soort: 'contact', id: c.id, naam: c.data.company, contactId: c.id }))]
          const v = vind(alle, tekst('klant'), (x) => x.naam, 'klant of contact')
          clientId = v.soort === 'klant' ? v.id : undefined
          contactId = v.contactId
        }
        // Productie of intern project (taken horen altijd ergens bij)
        let projectId: string | undefined
        if (tekst('project')) {
          const projecten = await sb<Rij<{ name: string; soort?: string; clientId?: string }>[]>('projects?select=id,data')
          const p = vind(projecten, tekst('project'), (x) => x.data.name, 'project')
          projectId = p.id
          if (p.data.soort === 'productie' && p.data.clientId && !clientId) {
            clientId = p.data.clientId
            const [k] = await sb<Rij<Klant>[]>(`clients?select=id,data&id=eq.${encodeURIComponent(clientId)}`)
            contactId = k?.data.contactId ?? contactId
          }
        }
        if (!clientId && !contactId && !projectId) return fout('Een taak hoort altijd bij een klant, contact of project: geef "klant" of "project" mee')
        const deadline = DATUM.test(tekst('deadline')) ? tekst('deadline') : standaardAfVoor()
        const deeltaken = Array.isArray(b.deeltaken) ? (b.deeltaken as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()) : []
        const taak: Taak = {
          id: id(), title: titel, description: tekst('omschrijving') || undefined,
          priority: ['hoog', 'middel', 'laag'].includes(tekst('prioriteit')) ? tekst('prioriteit') : 'middel',
          soort: tekst('soort') || (clientId ? 'Klantwerk' : 'Business improvement'),
          deadline, assignee: tekst('wie') || persoon, status: 'todo', clientId, contactId, projectId, inTodo: projectId ? true : undefined, inAgenda: true, comments: [],
          subtasks: deeltaken.length ? verdeelDeadlines(deeltaken.map((t) => ({ id: id(), title: t.trim(), done: false })), deadline) : undefined,
          subtasksConfirmed: deeltaken.length ? true : undefined,
          updatedAt: nu(),
          door: `claude:${persoon}`,
        }
        await schrijf('tasks', { id: taak.id, data: taak })
        if (agendaGekoppeld()) await syncTaak(taak as never).catch((e) => console.error('agenda', e))
        return Response.json({ ok: true, taak: { id: taak.id, titel, deadline, deeltaken: taak.subtasks?.map((s) => `${s.title} (vóór ${s.deadline})`) } })
      }

      case 'deeltaak-af': {
        const taken = (await sb<Rij<Taak>[]>('tasks?select=id,data')).filter((r) => r.data.status !== 'klaar')
        const t = vind(taken, tekst('taak'), (r) => r.data.title, 'taak')
        const st = vind(t.data.subtasks ?? [], tekst('deeltaak'), (s) => s.title, 'deeltaak')
        const subtasks = (t.data.subtasks ?? []).map((s) => (s.id === st.id ? { ...s, done: true, doneAt: nu(), doneBy: persoon } : s))
        const alles = subtasks.every((s) => s.done)
        const data = { ...t.data, subtasks, subtasksConfirmed: true, status: alles ? 'klaar' : t.data.status === 'todo' ? 'bezig' : t.data.status, startedAt: (t.data.startedAt as string) ?? nu(), updatedAt: nu() }
        await schrijf('tasks', { id: t.id, data })
        if (agendaGekoppeld()) await syncTaak(data as never).catch((e) => console.error('agenda', e))
        return Response.json({ ok: true, taak: t.data.title, afgevinkt: st.title, taakKlaar: alles })
      }

      case 'contact': {
        const bedrijf = tekst('bedrijf')
        if (!bedrijf) return fout('bedrijf ontbreekt')
        const fase = ['koud', 'gemaild', 'lead', 'voorstel', 'klant', 'afgehandeld'].includes(tekst('fase')) ? tekst('fase') : 'koud'
        const c: Contact = { id: id(), company: bedrijf, name: tekst('naam'), role: tekst('functie'), email: tekst('email'), phone: tekst('telefoon'), stage: fase, value: 0, owner: persoon, source: tekst('bron') || 'Claude', website: tekst('website') || undefined, timeline: [] }
        await schrijf('contacts', { id: c.id, data: c })
        return Response.json({ ok: true, contact: { id: c.id, bedrijf, fase } })
      }

      case 'notitie': {
        const contacten = await sb<Rij<Contact>[]>('contacts?select=id,data')
        const c = vind(contacten, tekst('contact'), (r) => r.data.company || r.data.name, 'contact')
        if (!tekst('tekst')) return fout('tekst ontbreekt')
        const soort = ['notitie', 'gesprek', 'whatsapp', 'mail-in', 'mail-uit'].includes(tekst('soort')) ? tekst('soort') : 'notitie'
        const data = { ...c.data, timeline: [{ id: id(), kind: soort, at: nu(), author: persoon, body: tekst('tekst') }, ...(c.data.timeline ?? [])] }
        await schrijf('contacts', { id: c.id, data })
        return Response.json({ ok: true, contact: c.data.company, soort })
      }

      case 'opvolgen': {
        if (!DATUM.test(tekst('datum'))) return fout('datum moet YYYY-MM-DD zijn')
        const contacten = await sb<Rij<Contact>[]>('contacts?select=id,data')
        const c = vind(contacten, tekst('contact'), (r) => r.data.company || r.data.name, 'contact')
        await schrijf('contacts', { id: c.id, data: { ...c.data, opvolgen: tekst('datum') } })
        return Response.json({ ok: true, contact: c.data.company, opvolgen: tekst('datum') })
      }

      case 'klanttaak': {
        const klanten = await sb<Rij<Klant>[]>('clients?select=id,data')
        const k = vind(klanten, tekst('klant'), (r) => r.data.name, 'klant')
        if (!tekst('titel')) return fout('titel ontbreekt')
        const kt = { id: id(), title: tekst('titel'), description: tekst('toelichting') || undefined, deadline: DATUM.test(tekst('deadline')) ? tekst('deadline') : undefined, done: false, createdAt: nu(), by: persoon }
        await schrijf('clients', { id: k.id, data: { ...k.data, klantTaken: [...(k.data.klantTaken ?? []), kt] } })
        return Response.json({ ok: true, klant: k.data.name, klanttaak: kt.title, mail: 'gaat binnen een half uur gebundeld naar de klant' })
      }

      default:
        return fout('Onbekende actie. Kies: taak, deeltaak-af, contact, notitie, opvolgen, klanttaak')
    }
  } catch (e) {
    return fout((e as Error).message, 422)
  }
}
