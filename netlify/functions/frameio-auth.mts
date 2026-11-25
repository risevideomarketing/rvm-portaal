// Frame.io koppelen (eenmalig, door het team).
// 1. GET ?start=1&t=<supabase-token>  → doorsturen naar de Adobe-inlog
// 2. Adobe stuurt terug met ?code=…&state=…  → tokens opslaan, terug naar Instellingen
import { SITE, env, teken, verifyUser } from '../lib/rise.mts'
import { REDIRECT, SCOPES, wisselCode } from '../lib/frameio.mts'

export default async (req: Request) => {
  const q = new URL(req.url).searchParams
  if (q.get('start')) {
    const me = await verifyUser(q.get('t'))
    if (!me) return new Response('Alleen voor het team. Log eerst in op het dashboard.', { status: 401 })
    const ts = String(Date.now())
    const auth = new URL('https://ims-na1.adobelogin.com/ims/authorize/v2')
    auth.search = new URLSearchParams({ client_id: env('FRAMEIO_CLIENT_ID'), redirect_uri: REDIRECT, scope: SCOPES, response_type: 'code', state: `${ts}.${teken(`frameio:${ts}`)}` }).toString()
    return Response.redirect(auth.toString(), 302)
  }
  const code = q.get('code')
  const [ts, sig] = (q.get('state') ?? '').split('.')
  if (!code || !ts || sig !== teken(`frameio:${ts}`) || Date.now() - Number(ts) > 15 * 60_000) {
    return Response.redirect(`${SITE}/#/instellingen?frameio=fout`, 302)
  }
  try {
    await wisselCode(code)
    return Response.redirect(`${SITE}/#/instellingen?frameio=ok`, 302)
  } catch (e) {
    console.error(e)
    return Response.redirect(`${SITE}/#/instellingen?frameio=fout`, 302)
  }
}
