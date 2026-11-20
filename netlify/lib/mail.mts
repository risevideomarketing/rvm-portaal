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
    `From: ${kop('Rise Video Marketing')} <${user}>`,
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
  return `<div style="background:#EEECE5;padding:40px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0C1625">
  <div style="max-width:560px;margin:0 auto">
    <div style="padding:0 4px 22px"><img src="https://app.risevideomarketing.nl/img/logo-navy.png" alt="Rise Video Marketing" width="96" style="display:block;border:0"></div>
    <div style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 1px 2px rgba(12,22,37,.04)">
      <div style="height:6px;background:linear-gradient(90deg,#0C1625,#3A4F6B,#D3DFE6)"></div>
      <div style="padding:40px 40px 36px">
        ${aanhef ? `<p style="font-size:16px;line-height:1.6;margin:0 0 18px;color:#2C2C2C">${aanhef}</p>` : ''}
        <h1 style="font-size:24px;line-height:1.25;font-weight:600;letter-spacing:-.01em;margin:0 0 14px;color:#0C1625">${titel}</h1>
        <p style="font-size:16px;line-height:1.65;margin:0 0 24px;color:#3B4656">${intro}</p>
        ${blokHtml}
        <p style="margin:30px 0 0"><a href="${url}" style="background:#0C1625;color:#ffffff;text-decoration:none;padding:15px 30px;border-radius:999px;display:inline-block;font-size:15px;font-weight:600;letter-spacing:.01em">${knop}</a></p>
        ${naKnop ? `<p style="font-size:14px;line-height:1.6;margin:22px 0 0;color:#667185">${naKnop}</p>` : ''}
        ${afzender ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:34px 0 0;border-top:1px solid #E8E6DF;padding-top:24px;width:100%"><tr>
          <td style="width:52px;vertical-align:top;padding-top:24px"><img src="https://app.risevideomarketing.nl/img/team/daan-mail.jpg" alt="" width="44" height="44" style="display:block;border-radius:50%;border:0"></td>
          <td style="vertical-align:top;padding-top:24px;font-size:14px;line-height:1.5;color:#3B4656">Hartelijke groet,<br><strong style="color:#0C1625">Daan Schuurmans</strong><br>Creative Producer · Rise Video Marketing<br><a href="tel:+31640750113" style="color:#3B4656;text-decoration:none">+31 6 40 75 01 13</a></td>
        </tr></table>` : ''}
      </div>
    </div>
    <p style="font-size:12px;line-height:1.6;color:#8895A8;margin:20px 4px 0;text-align:center">Rise Video Marketing · Havenweg 21T, Amersfoort · <a href="https://risevideomarketing.nl" style="color:#8895A8">risevideomarketing.nl</a>${voet ? `<br>${voet}` : ''}</p>
  </div>
</div>`
}

/** Eén regel in een rustig lijstje (voor in blokHtml). */
export const mailPunt = (titel: string, tekst: string) => `<tr><td style="padding:12px 0;border-bottom:1px solid #F0EEE8;vertical-align:top;width:26px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#B2BFC9;margin-top:7px"></span></td><td style="padding:12px 0;border-bottom:1px solid #F0EEE8;font-size:15px;line-height:1.55;color:#3B4656"><strong style="color:#0C1625">${titel}</strong><br>${tekst}</td></tr>`

/** Voornaam uit "Manon de Vries" of "Manon & Cora"; leeg als er niets is. */
export const voornaam = (naam?: string) => (naam ?? '').trim().split(/\s+/)[0] ?? ''

export const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
