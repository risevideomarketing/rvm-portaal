// Nieuwe taken voor de klant (in het portaal) gebundeld mailen.
// Elke 15 minuten: per klant de open taken die nog niet gemaild zijn. Is de oudste daarvan 30 minuten oud,
// dan gaan ze allemaal in één mail naar de mensen van de klant met portaaltoegang. Zo krijgt de klant
// bij vijf taken in een half uur één mail, niet vijf. Elke taak gaat maar één keer mee (tabel sent_notifications).
import { html, mailGekoppeld, riseMail, stuurMail } from '../lib/mail.mts'
import { SITE, claim, sb, teken } from '../lib/rise.mts'

const BUNDEL_MINUTEN = 30
const PORTAAL = 'https://app.risevideomarketing.nl'

interface KlantTaak { id: string; title: string; description?: string; deadline?: string; done: boolean; createdAt: string }
interface ClientRow { id: string; name: string; logins?: string[]; klantTaken?: KlantTaak[]; mailUit?: string[] }

const datumNL = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' })

export default async () => {
  if (!mailGekoppeld()) {
    console.log(JSON.stringify({ overgeslagen: 'SMTP_USER/SMTP_PASSWORD ontbreken' }))
    return new Response('geen mailserver')
  }
  const rows = await sb<{ data: ClientRow }[]>('clients?select=data')
  const verstuurd: string[] = []
  const fouten: string[] = []

  for (const { data: c } of rows) {
    const open = (c.klantTaken ?? []).filter((t) => !t.done)
    const uit = new Set((c.mailUit ?? []).map((e) => e.toLowerCase()))
    const logins = (c.logins ?? []).filter((e) => !uit.has(e.toLowerCase()))
    if (!open.length || !logins.length) continue
    try {
      const sleutels = open.map((t) => `klanttaak:${t.id}`)
      const al = await sb<{ key: string }[]>(`sent_notifications?select=key&key=in.(${sleutels.map((k) => `"${k}"`).join(',')})`)
      const gemaild = new Set(al.map((r) => r.key))
      const nieuw = open.filter((t) => !gemaild.has(`klanttaak:${t.id}`)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      if (!nieuw.length) continue
      if (Date.now() - new Date(nieuw[0].createdAt).getTime() < BUNDEL_MINUTEN * 60_000) continue

      const een = nieuw.length === 1
      const lijst = nieuw
        .map((t) => `<div style="background:#F7F6F2;border-radius:14px;padding:16px 18px;margin:0 0 10px">
          <p style="font-size:15px;font-weight:600;margin:0;color:#0C1625">${html(t.title)}</p>
          ${t.description ? `<p style="font-size:14px;line-height:1.5;margin:6px 0 0;color:#3B4656">${html(t.description)}</p>` : ''}
          ${t.deadline ? `<p style="font-size:13px;margin:6px 0 0;color:#667185">Graag vóór ${datumNL(t.deadline)}</p>` : ''}
        </div>`)
        .join('')
      // Per ontvanger een eigen mail, met een eigen afmeldlink
      for (const ontvanger of logins) {
        const q = new URLSearchParams({ k: c.id, e: ontvanger, t: teken(`${c.id}:${ontvanger.toLowerCase()}`) }).toString()
        const afmelden = `${SITE}/.netlify/functions/afmelden?${q}`
        await stuurMail({
          aan: [ontvanger],
          onderwerp: een ? `Eén klein dingetje voor ${c.name}: ${nieuw[0].title}` : `${nieuw.length} kleine dingetjes voor ${c.name}`,
          koppen: [`List-Unsubscribe: <${afmelden}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click'],
          html: riseMail({
            titel: een ? 'Eén klein dingetje van jouw kant' : `${nieuw.length} kleine dingetjes van jouw kant`,
            intro: `We nemen zoveel mogelijk uit handen, maar voor ${html(c.name)} hebben we ${een ? 'heel even jouw input' : 'heel even een paar dingen van je'} nodig. Daarna gaan wij er meteen weer mee verder.`,
            aanhef: 'Hoi,',
            blokHtml: lijst,
            knop: 'Open je portaal',
            url: PORTAAL,
            voet: `<a href="${afmelden}" style="color:#8895A8">Geen meldingen meer ontvangen</a>`,
          }),
          tekst: [
            'Hoi,', '', `Voor ${c.name} hebben we heel even jouw input nodig:`,
            '',
            ...nieuw.map((t) => `- ${t.title}${t.deadline ? ` (graag vóór ${datumNL(t.deadline)})` : ''}${t.description ? `\n  ${t.description}` : ''}`),
            '',
            `Je vindt alles in je portaal: ${PORTAAL}`,
            '',
            'Hartelijke groet,',
            'Daan Schuurmans, Rise Video Marketing',
            '',
            `Geen meldingen meer ontvangen: ${afmelden}`,
          ].join('\n'),
        })
      }
      // Pas na het versturen vastleggen; een mislukte mail gaat de volgende ronde opnieuw
      for (const t of nieuw) await claim(`klanttaak:${t.id}`)
      verstuurd.push(`${c.id}: ${nieuw.length}`)
    } catch (e) {
      fouten.push(`${c.id}: ${(e as Error).message}`)
    }
  }

  console.log(JSON.stringify({ verstuurd, fouten }))
  return Response.json({ verstuurd, fouten })
}

export const config = { schedule: '*/15 * * * *' }
