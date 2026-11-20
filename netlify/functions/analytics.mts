// Google Analytics 4 voor de statistieken (alleen het team): van risevideomarketing.nl, of met ?clientId= van een klant
// waar we de website voor doen (GA4-property-ID staat bij de klant; het serviceaccount moet ook daar Viewer zijn).
// GET ?periode=7d|30d[&clientId=fus] → bezoekers, sessies, conversies (key events) met de periode ervoor, plus de top 5 kanalen.
// Nodig in Netlify: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY en GA4_PROPERTY_ID.
// Het serviceaccount staat in GA4 als Viewer op de property (Beheer → Toegangsbeheer property).
import { googleGekoppeld, googleToken } from '../lib/google.mts'
import { sb, verifyUser } from '../lib/rise.mts'

type Rapport = { rows?: { dimensionValues?: { value: string }[]; metricValues: { value: string }[] }[] }

async function rapport(property: string, body: object): Promise<Rapport> {
  const token = await googleToken('https://www.googleapis.com/auth/analytics.readonly')
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Google Analytics ${res.status} ${await res.text()}`)
  return (await res.json()) as Rapport
}

const METRICS = [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'keyEvents' }]
const getallen = (r: Rapport) => {
  const v = r.rows?.[0]?.metricValues.map((m) => Number(m.value)) ?? [0, 0, 0]
  return { bezoekers: v[0] ?? 0, sessies: v[1] ?? 0, conversies: v[2] ?? 0 }
}

export default async (req: Request) => {
  const me = await verifyUser(req.headers.get('x-supabase-token'))
  if (!me) return new Response('Alleen het team', { status: 401 })
  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId')
  let property = process.env.GA4_PROPERTY_ID ?? ''
  if (clientId) {
    const [row] = await sb<{ data: { ga4PropertyId?: string } }[]>(`clients?select=data&id=eq.${encodeURIComponent(clientId)}`)
    property = (row?.data.ga4PropertyId ?? '').replace(/\D/g, '')
  }
  if (!googleGekoppeld() || !property) return Response.json({ gekoppeld: false })
  const dagen = url.searchParams.get('periode') === '30d' ? 30 : 7
  try {
    const [nu, ervoor, kanalen] = await Promise.all([
      rapport(property, { dateRanges: [{ startDate: `${dagen}daysAgo`, endDate: 'yesterday' }], metrics: METRICS }),
      rapport(property, { dateRanges: [{ startDate: `${dagen * 2}daysAgo`, endDate: `${dagen + 1}daysAgo` }], metrics: METRICS }),
      rapport(property, {
        dateRanges: [{ startDate: `${dagen}daysAgo`, endDate: 'yesterday' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 5,
      }),
    ])
    return Response.json({
      gekoppeld: true,
      dagen,
      nu: getallen(nu),
      ervoor: getallen(ervoor),
      kanalen: (kanalen.rows ?? []).map((r) => ({ naam: r.dimensionValues?.[0]?.value ?? '', sessies: Number(r.metricValues[0].value) })),
    })
  } catch (e) {
    return new Response((e as Error).message, { status: 502 })
  }
}
