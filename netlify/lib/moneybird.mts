// Moneybird: gedeelde helpers (lezen, schrijven, klant koppelen).
// Nodig in Netlify: MONEYBIRD_TOKEN (geheim) en MONEYBIRD_ADMINISTRATION_ID.

export const moneybirdGekoppeld = () => Boolean(process.env.MONEYBIRD_TOKEN && process.env.MONEYBIRD_ADMINISTRATION_ID)

export async function mb<T>(pad: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`https://moneybird.com/api/v2/${(process.env.MONEYBIRD_ADMINISTRATION_ID ?? '').replace(/\D/g, '')}/${pad}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${(process.env.MONEYBIRD_TOKEN ?? '').trim().replace(/^Bearer\s+/i, '').replace(/[^!-~]/g, '')}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    const tekst = await res.text().catch(() => '')
    if (res.status === 403) throw new Error('Moneybird weigert dit (403). Heeft de API-sleutel ook schrijfrechten op verkoopfacturen?')
    throw new Error(`Moneybird ${res.status}${tekst ? `: ${tekst.slice(0, 200)}` : ''}`)
  }
  return (await res.json()) as T
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Moneybird-contact van een klant: het ingestelde ID, anders een eenduidige match op bedrijfsnaam (liever niets dan de verkeerde). */
export async function contactVoorKlant(klant: { name?: string; moneybirdContactId?: string }): Promise<{ id: string; naam?: string } | null> {
  const vast = klant.moneybirdContactId?.trim()
  if (vast) return { id: vast }
  if (!klant.name) return null
  const gevonden = await mb<{ id: string; company_name?: string }[]>(`contacts.json?query=${encodeURIComponent(klant.name)}&per_page=10`)
  const exact = gevonden.filter((c) => norm(c.company_name ?? '') === norm(klant.name!))
  const k = exact.length === 1 ? exact[0] : gevonden.length === 1 ? gevonden[0] : undefined
  return k ? { id: k.id, naam: k.company_name } : null
}
