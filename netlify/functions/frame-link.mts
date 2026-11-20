// Korte Frame.io-link (f.io/…) omzetten naar de volledige deellink (next.frame.io/share/…), die wel in de pagina te tonen is.
// GET ?url=https://f.io/abc → { url }. Alleen voor het team; volgt alleen redirects binnen frame.io.
import { verifyUser } from '../lib/rise.mts'

const isFrame = (u: URL) => u.hostname === 'f.io' || /(^|\.)frame\.io$/.test(u.hostname)

export default async (req: Request) => {
  const me = await verifyUser(req.headers.get('x-supabase-token'))
  if (!me) return new Response('Niet ingelogd', { status: 401 })
  let url: URL
  try { url = new URL(new URL(req.url).searchParams.get('url') ?? '') } catch { return new Response('Geen geldige link', { status: 400 }) }
  if (!isFrame(url)) return new Response('Alleen Frame.io-links', { status: 400 })
  for (let i = 0; i < 5 && url.hostname === 'f.io'; i++) {
    const res = await fetch(url, { redirect: 'manual' })
    const naar = res.headers.get('location')
    if (!naar) break
    const volgende = new URL(naar, url)
    if (!isFrame(volgende)) return new Response('Link leidt niet naar Frame.io', { status: 400 })
    url = volgende
  }
  if (url.hostname === 'f.io') return new Response('Deze f.io-link kon niet worden omgezet', { status: 502 })
  return Response.json({ url: url.toString() })
}
