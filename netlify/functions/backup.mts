// Nachtelijke back-up van het hele dashboard (03:00 Nederlandse wintertijd).
// Bestemming (één of beide):
//   BACKUP_DRIVE_FOLDER_ID  · map in een GEDEELDE drive (Google Workspace), gedeeld met het serviceaccount als Inhoudsbeheerder.
//                             Per nacht: rise-backup-JJJJ-MM-DD.json plus twee spreadsheets (taken, CRM).
//                             Bewaard: 30 dagen, plus de 1e van elke maand; oudere gaan naar de prullenbak (nog 30 dagen terug te halen).
//   BACKUP_MAIL             · mailadres dat elke nacht de back-up als bijlage krijgt (eigen mailserver), als er (nog) geen gedeelde drive is.
// Mislukt het, dan komt er een bericht in het Slack-kanaal.
import { googleGekoppeld, googleToken } from '../lib/google.mts'
import { leesbaar, maakBackup } from '../lib/backup.mts'
import { mailGekoppeld, stuurMail } from '../lib/mail.mts'
import { channel } from '../lib/rise.mts'

const BEWAAR_DAGEN = 30

async function drive(pad: string, init: RequestInit = {}) {
  const token = await googleToken('https://www.googleapis.com/auth/drive')
  const res = await fetch(`https://www.googleapis.com/${pad}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
  if (!res.ok) throw new Error(`Drive ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

async function upload(map: string, naam: string, inhoud: string, mime: string, alsSpreadsheet = false) {
  const grens = `rise${Date.now()}`
  const meta = { name: naam, parents: [map], ...(alsSpreadsheet ? { mimeType: 'application/vnd.google-apps.spreadsheet' } : {}) }
  const body = `--${grens}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${grens}\r\nContent-Type: ${mime}; charset=UTF-8\r\n\r\n${inhoud}\r\n--${grens}--`
  return drive('upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${grens}` }, body })
}

/** Oude back-ups naar de prullenbak: ouder dan 30 dagen en niet van de 1e van de maand. */
async function opruimen(map: string) {
  const q = encodeURIComponent(`'${map}' in parents and trashed = false and name contains 'rise-'`)
  const lijst = (await drive(`drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`)) as { files: { id: string; name: string }[] }
  const grens = new Date(Date.now() - BEWAAR_DAGEN * 86_400_000).toISOString().slice(0, 10)
  let weg = 0
  for (const f of lijst.files) {
    const datum = f.name.match(/(\d{4}-\d{2}-\d{2})/)?.[1]
    if (!datum || datum >= grens || datum.endsWith('-01')) continue
    await drive(`drive/v3/files/${f.id}?supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) })
    weg++
  }
  return weg
}

export default async () => {
  const datum = new Date().toISOString().slice(0, 10)
  const uit: string[] = []
  try {
    const b = await maakBackup()
    const json = JSON.stringify(b)
    const { taken, crm } = leesbaar(b)
    const map = process.env.BACKUP_DRIVE_FOLDER_ID?.trim()
    const mail = process.env.BACKUP_MAIL?.trim()
    if (!map && !mail) {
      console.log(JSON.stringify({ overgeslagen: 'geen BACKUP_DRIVE_FOLDER_ID of BACKUP_MAIL ingesteld', aantallen: b.aantallen }))
      return new Response('geen bestemming')
    }
    if (map) {
      if (!googleGekoppeld()) throw new Error('Google-serviceaccount ontbreekt')
      await upload(map, `rise-backup-${datum}.json`, json, 'application/json')
      await upload(map, `rise-taken-${datum}`, taken, 'text/csv', true)
      await upload(map, `rise-crm-${datum}`, crm, 'text/csv', true)
      uit.push(`drive (${await opruimen(map)} oude naar prullenbak)`)
    }
    if (mail) {
      if (!mailGekoppeld()) throw new Error('Mailserver ontbreekt')
      await stuurMail({
        aan: [mail],
        onderwerp: `Back-up Rise-dashboard ${datum}`,
        html: `<p>Back-up van ${datum}: ${Object.entries(b.aantallen).map(([k, v]) => `${k} ${v}`).join(', ')}.</p><p>Terugzetten: <code>node scripts/terugzetten.mjs pad/naar/bestand.json</code> (zie de repo).</p>`,
        tekst: `Back-up van ${datum}: ${Object.entries(b.aantallen).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
        bijlagen: [
          { naam: `rise-backup-${datum}.json`, type: 'application/json', inhoud: json },
          { naam: `rise-taken-${datum}.csv`, type: 'text/csv', inhoud: taken },
          { naam: `rise-crm-${datum}.csv`, type: 'text/csv', inhoud: crm },
        ],
      })
      uit.push('mail')
    }
    console.log(JSON.stringify({ datum, naar: uit, aantallen: b.aantallen, grootte: json.length }))
    return Response.json({ ok: true, naar: uit, aantallen: b.aantallen })
  } catch (e) {
    const fout = (e as Error).message
    console.error('Back-up mislukt', fout)
    await channel(`:warning: De nachtelijke back-up van het dashboard is mislukt (${datum}): ${fout.slice(0, 300)}`).catch(() => undefined)
    return new Response(fout, { status: 500 })
  }
}

export const config = { schedule: '0 2 * * *' }
