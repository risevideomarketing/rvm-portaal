import { Icon } from './ui'

const LAUNCH_CSS = `.frame-launch{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;min-height:260px;padding:32px 24px;border-radius:16px;background:#0d1522;border:1px solid var(--line);color:#fff  !important;text-decoration:none  !important;transition:background 0.15s ease,transform 0.15s ease;}.frame-launch:hover{background:#132036;transform:translateY(-1px);}.frame-embed.donker .frame-launch{background:#16233a;border-color:#23324a;}.frame-embed.donker .frame-launch:hover{background:#1c2c47;}.frame-launch-play{width:64px;height:64px;border-radius:50%;background:#fff;color:var(--navy);display:flex;align-items:center;justify-content:center;margin-bottom:4px;}.frame-launch strong{font-size:18px;font-weight:600;}.frame-launch span:not(.frame-launch-play){font-size:14px;line-height:1.5;color:#c7d0da;max-width:420px;}.frame-launch em{font-style:normal;display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:9px 16px;border-radius:10px;background:#fff;color:var(--navy);font-size:14px;font-weight:500;}.sv-frame-groot .frame-launch{min-height:340px;}`

/**
 * Frame.io ingesloten. Deellinks van Frame.io zelf (next.frame.io/share, app.frame.io/presentations en /reviews)
 * mogen in een iframe; de korte f.io-links blokkeren dat (X-Frame-Options), daarvoor alleen een knop.
 */
export const frameInsluitbaar = (url?: string) => {
  if (!url) return false
  try {
    const u = new URL(url.trim())
    return /(^|\.)frame\.io$/.test(u.hostname) && u.hostname !== 'f.io' && /\/(share|presentations|reviews|player)\//.test(u.pathname + '/')
  } catch { return false }
}

export function FrameEmbed({ url, titel = 'Video\'s en feedback', donker = false, inline = false }: { url?: string; titel?: string; donker?: boolean; inline?: boolean }) {
  if (!url?.trim()) return null
  const link = url.trim()
  // Klantportaal: geen ingesloten Frame.io meer. In een ingesloten venster kan Frame.io je naam niet opslaan
  // (browsers blokkeren cookies van derden), dus reageren gaf "Oops! Something went wrong". Daarom een grote kaart
  // die Frame.io in een nieuw tabblad opent; daar werkt reageren wel, zonder account.
  if (!inline) {
    return (
      <div className={`frame-embed ${donker ? 'donker' : ''}`}>
        <style>{LAUNCH_CSS}</style>
        <a className="frame-launch" href={link} target="_blank" rel="noreferrer">
          <span className="frame-launch-play"><Icon name="play" size={26} /></span>
          <strong>Bekijk je video's en geef feedback</strong>
          <span>Opent in Frame.io in een nieuw tabblad. Klik op het moment in de video en typ je opmerking. Een account is niet nodig.</span>
          <em>Openen <Icon name="external" size={13} /></em>
        </a>
      </div>
    )
  }
  const kort = /^https?:\/\/f\.io\//i.test(link)
  return (
    <div className={`frame-embed ${donker ? 'donker' : ''}`}>
      <a className="frame-embed-knop frame-feedback-knop" href={link} target="_blank" rel="noreferrer"><Icon name="note" size={14} /> Openen in Frame.io <Icon name="external" size={13} /></a>
      {frameInsluitbaar(link) ? (
        <div className="frame-embed-venster">
          <iframe src={link} title={`Frame.io · ${titel}`} allow="autoplay; fullscreen; picture-in-picture; clipboard-write" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      ) : kort ? (
        <p className="frame-embed-uitleg">Deze korte f.io-link kan niet in de pagina getoond worden. Open hem in Frame.io.</p>
      ) : null}
    </div>
  )
}
