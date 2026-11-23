import { Icon } from './ui'

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

export function FrameEmbed({ url, titel = 'Video\'s en feedback', donker = false }: { url?: string; titel?: string; donker?: boolean }) {
  if (!url?.trim()) return null
  const link = url.trim()
  const kort = /^https?:\/\/f\.io\//i.test(link)
  // Feedback altijd in Frame.io zelf (nieuw tabblad): in een ingesloten venster onthoudt Frame.io je naam/login niet,
  // waardoor opmerkingen niet blijven staan. Het venster hier is alleen om te kijken.
  return (
    <div className={`frame-embed ${donker ? 'donker' : ''}`}>
      <a className="frame-embed-knop frame-feedback-knop" href={link} target="_blank" rel="noreferrer"><Icon name="note" size={14} /> Feedback geven in Frame.io <Icon name="external" size={13} /></a>
      <p className="frame-embed-uitleg">Kijken kan hieronder. Voor feedback opent Frame.io in een nieuw tabblad. Log daar in of vul je naam in, dan blijven je opmerkingen bewaard en zien wij ze direct.</p>
      {frameInsluitbaar(link) ? (
        <div className="frame-embed-venster">
          <iframe src={link} title={`Frame.io · ${titel}`} allow="autoplay; fullscreen; picture-in-picture; clipboard-write" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      ) : kort ? (
        <p className="frame-embed-uitleg">Deze korte f.io-link kan niet in de pagina getoond worden. Open hem hieronder in Frame.io.</p>
      ) : null}
    </div>
  )
}
