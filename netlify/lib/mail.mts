// Mail versturen via de eigen mailserver (Strato, noreply@risevideomarketing.nl), zonder extra pakketten.
// Nodig in Netlify: SMTP_USER (noreply@risevideomarketing.nl) en SMTP_PASSWORD; SMTP_HOST is standaard smtp.strato.de.
import { connect } from 'node:tls'
import { env } from './rise.mts'

export const mailGekoppeld = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD)

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
/** Base64 in regels van 76 tekens, zoals mail dat wil. */
const blok = (s: string) => b64(s).replace(/.{1,76}/g, '$&\r\n')
const kop = (s: string) => `=?UTF-8?B?${b64(s)}?=`

export async function stuurMail({ aan, onderwerp, html, tekst, koppen = [], bijlagen = [] }: { aan: string[]; onderwerp: string; html: string; tekst: string; koppen?: string[]; bijlagen?: { naam: string; type: string; inhoud: string }[] }) {
  const host = process.env.SMTP_HOST || 'smtp.strato.de'
  const user = env('SMTP_USER')
  const pass = env('SMTP_PASSWORD')
  const ontvangers = [...new Set(aan.map((a) => a.trim().toLowerCase()).filter((a) => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(a)))]
  if (!ontvangers.length) throw new Error('Geen geldige ontvangers')

  const sock = connect({ host, port: 465, servername: host })
  sock.setTimeout(20_000, () => sock.destroy(new Error('SMTP: geen antwoord binnen 20 seconden')))
  let buf = ''
  let wacht: { ok: (r: string) => void; fout: (e: Error) => void } | null = null
  const check = () => {
    // Antwoord is compleet als de laatste regel "123 tekst" is (meerregelig: "250-..." tot "250 ...")
    if (wacht && /(^|\r\n)\d{3} [^\r\n]*\r\n$/.test(buf)) {
      const r = buf
      buf = ''
      const w = wacht
      wacht = null
      w.ok(r)
    }
  }
  sock.on('data', (d) => { buf += d.toString(); check() })
  sock.on('error', (e) => { if (wacht) { const w = wacht; wacht = null; w.fout(e) } })
  const lees = () => new Promise<string>((ok, fout) => { wacht = { ok, fout }; check() })
  const zeg = async (cmd: string | null, verwacht: string, label = cmd?.split(' ')[0] ?? 'begroeting') => {
    if (cmd !== null) sock.write(`${cmd}\r\n`)
    const r = await lees()
    if (!new RegExp(`(^|\\r\\n)${verwacht}`).test(r)) throw new Error(`SMTP ${label}: ${r.trim()}`)
    return r
  }

  const grens = `rise-${Date.now().toString(36)}`
  const bericht = [
    `From: ${kop('Rise | Video Marketing Agency')} <${user}>`,
    `To: ${ontvangers.join(', ')}`,
    'Reply-To: hello@risevideomarketing.nl',
    ...koppen,
    `Subject: ${kop(onderwerp)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@risevideomarketing.nl>`,
    'MIME-Version: 1.0',
    // Met bijlagen: multipart/mixed met daarin de tekst- en html-versie
    ...(bijlagen.length ? [`Content-Type: multipart/mixed; boundary="${grens}-m"`, '', `--${grens}-m`] : []),
    `Content-Type: multipart/alternative; boundary="${grens}"`,
    '',
    `--${grens}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    blok(tekst),
    `--${grens}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    blok(html),
    `--${grens}--`,
    ...bijlagen.flatMap((b) => [
      `--${grens}-m`,
      `Content-Type: ${b.type}; charset=UTF-8; name="${b.naam}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${b.naam}"`,
      '',
      blok(b.inhoud),
    ]),
    ...(bijlagen.length ? [`--${grens}-m--`] : []),
  ].join('\r\n')

  try {
    await zeg(null, '220')
    await zeg('EHLO risevideomarketing.nl', '250')
    await zeg('AUTH LOGIN', '334')
    await zeg(b64(user), '334', 'gebruikersnaam')
    await zeg(b64(pass), '235', 'wachtwoord')
    await zeg(`MAIL FROM:<${user}>`, '250')
    for (const a of ontvangers) await zeg(`RCPT TO:<${a}>`, '25')
    await zeg('DATA', '354')
    // Regels die met een punt beginnen krijgen een extra punt (anders ziet de server ze als einde)
    await zeg(`${bericht.replace(/\r\n\./g, '\r\n..')}\r\n.`, '250', 'bericht')
    await zeg('QUIT', '221').catch(() => undefined)
  } finally {
    sock.end()
  }
}

/** Mail in Rise-stijl: rustig, persoonlijk en premium (zelfde opmaak als de inlogmail). Klanten moeten zich in de watten gelegd voelen. */
export function riseMail({ titel, intro, blokHtml, knop, url, naKnop = '', voet = '', aanhef, afzender = true }: { titel: string; intro: string; blokHtml: string; knop: string; url: string; naKnop?: string; voet?: string; aanhef?: string; afzender?: boolean }) {
  return `<div style="background:#F3F3F3;padding:40px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0C1625">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E4E6EA;border-radius:22px;overflow:hidden">
    <div style="background:#0C1625;padding:30px 40px"><img src="https://app.risevideomarketing.nl/img/logo-wit.png" alt="Rise" width="88" height="26" style="display:block;border:0"></div>
    <div style="padding:40px 40px 32px">
      ${aanhef ? `<p style="font-size:17px;line-height:1.6;margin:0 0 18px;color:#2C3542">${aanhef}</p>` : ''}
      <h1 style="font-size:26px;line-height:1.25;font-weight:700;margin:0 0 14px;color:#0C1625">${titel}</h1>
      <p style="font-size:17px;line-height:1.6;margin:0 0 24px;color:#2C3542">${intro}</p>
      ${blokHtml}
      <p style="margin:30px 0 0"><a href="${url}" style="background:#0C1625;color:#ffffff;text-decoration:none;padding:16px 28px;border-radius:12px;display:inline-block;font-size:16px;font-weight:700">${knop}</a></p>
      ${naKnop ? `<div style="background:#F3F3F3;border-radius:16px;padding:18px 22px;margin:28px 0 0;font-size:14px;line-height:1.6;color:#667185">${naKnop}</div>` : ''}
      ${afzender ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0 0;width:100%"><tr>
        <td style="width:56px;vertical-align:top"><img src="https://app.risevideomarketing.nl/img/team/daan-mail.jpg" alt="" width="44" height="44" style="display:block;border-radius:50%;border:0"></td>
        <td style="vertical-align:top;font-size:14px;line-height:1.5;color:#2C3542">Hartelijke groet,<br><strong style="color:#0C1625">Daan Schuurmans</strong><br>Creative Producer · Rise Video Marketing<br><a href="tel:+31640750113" style="color:#2C3542;text-decoration:none">+31 6 40 75 01 13</a></td>
      </tr></table>` : ''}
    </div>
    <div style="border-top:1px solid #E4E6EA;padding:20px 40px;font-size:13px;line-height:1.6;color:#8895A8">Rise Video Marketing · <a href="https://risevideomarketing.nl" style="color:#8895A8">risevideomarketing.nl</a>${voet ? `<br>${voet}` : ''}</div>
  </div>
</div>`
}

/** Eén regel in een rustig lijstje (voor in blokHtml). */
export const mailPunt = (titel: string, tekst: string) => `<tr><td style="padding:12px 0;border-bottom:1px solid #EDEEF0;vertical-align:top;width:26px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#B2BFC9;margin-top:7px"></span></td><td style="padding:12px 0;border-bottom:1px solid #EDEEF0;font-size:15px;line-height:1.55;color:#3B4656"><strong style="color:#0C1625">${titel}</strong><br>${tekst}</td></tr>`

/** Voornaam uit "Manon de Vries" of "Manon & Cora"; leeg als er niets is. */
export const voornaam = (naam?: string) => (naam ?? '').trim().split(/\s+/)[0] ?? ''

export const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
