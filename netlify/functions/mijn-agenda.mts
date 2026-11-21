// Agenda voor het overzicht (alleen het team): afspraken van vandaag en de komende 6 dagen uit Google Agenda.
// Nodig in Netlify: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY en GOOGLE_AGENDAS
// (agenda-ID's met komma's, optioneel met naam: "Rise=abc@group.calendar.google.com,Shoots=def@group...").
// Elke agenda moet gedeeld zijn met het serviceaccount ("Alle details van afspraken bekijken").
import { googleGekoppeld, googleToken } from '../lib/google.mts'
import { verifyUser } from '../lib/rise.mts'

interface GEvent { id: string; summary?: string; start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string }; htmlLink?: string; location?: string; status?: string }

export default async (req: Request) => {
  if (!(await verifyUser(req.headers.get('x-supabase-token')))) return new Response('Alleen het team', { status: 401 })
  const lijst = (process.env.GOOGLE_AGENDAS ?? process.env.GOOGLE_CALENDAR_ID ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  // ?lijst=1: alleen de agenda-ID's, voor de ingesloten Google Agenda op de pagina Planning
  if (new URL(req.url).searchParams.get('lijst')) {
    return Response.json({ agendas: lijst.map((regel) => { const [naam, id] = regel.includes('=') ? regel.split('=') : ['', regel]; return { naam: naam.trim(), id: id.trim() } }) })
  }
  if (!googleGekoppeld() || lijst.length === 0) return Response.json({ gekoppeld: false, afspraken: [] })
  const van = new Date(); van.setHours(0, 0, 0, 0)
  const tot = new Date(van.getTime() + 7 * 86_400_000)
  try {
    const token = await googleToken('https://www.googleapis.com/auth/calendar.readonly')
    const per = await Promise.all(lijst.map(async (regel) => {
      const [naam, id] = regel.includes('=') ? regel.split('=') : ['', regel]
      const q = new URLSearchParams({ timeMin: van.toISOString(), timeMax: tot.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '100' })
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { console.error('Agenda', id, res.status, await res.text()); return [] }
      const j = (await res.json()) as { summary?: string; items?: GEvent[] }
      return (j.items ?? []).filter((e) => e.status !== 'cancelled').map((e) => ({
        id: `${id}:${e.id}`,
        titel: e.summary ?? '(geen titel)',
        start: e.start.dateTime ?? e.start.date ?? '',
        eind: e.end.dateTime ?? e.end.date ?? '',
        heleDag: !e.start.dateTime,
        agenda: naam || j.summary || '',
        plek: e.location,
        link: e.htmlLink,
      }))
    }))
    const afspraken = per.flat().sort((a, b) => a.start.localeCompare(b.start))
    return Response.json({ gekoppeld: true, afspraken }, { headers: { 'Cache-Control': 'private, max-age=120' } })
  } catch (e) {
    return Response.json({ gekoppeld: true, afspraken: [], fout: (e as Error).message })
  }
}
