import { useEffect, useRef, useState } from 'react'
import { MAX_MB, openLink, uploaden, weghalen } from '../bestanden'
import type { Bestand, Client, ContentItem, ContentStatus } from '../data/types'
import { uid, useStore } from '../store'
import { Drawer, Icon, personName } from './ui'

export const CONTENT_STATUSSEN: { key: ContentStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'bezig', label: 'Bezig' },
  { key: 'v1', label: '1e versie' },
  { key: 'laatste', label: 'Laatste versie' },
  { key: 'klaar', label: 'Klaar voor verzending' },
]
export const statusLabel = (s: ContentStatus) => CONTENT_STATUSSEN.find((x) => x.key === s)?.label ?? s
/** Kanalen om uit te kiezen; eigen kanalen kunnen erbij. */
export const STANDAARD_KANALEN = ['Instagram', 'LinkedIn', 'Maillijst', 'Facebook', 'TikTok', 'Blog']
/** Mail of post, voor de knoppen, formulieren en teksten. */
export const isMail = (kanaal: string) => /mail|nieuwsbrief/i.test(kanaal)
/** Mag de klant de volledige tekst zien? Pas vanaf de laatste versie (daarvoor: "nog in de maak"). */
export const tekstZichtbaarVoorKlant = (i: ContentItem) => i.status === 'laatste' || i.status === 'klaar'

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
export const datumTekst = (d: string, tijd?: string) =>
  `${new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}${tijd ? ` · ${tijd}` : ''}`

/** Items per maand, op datum; zonder datum onderaan. */
function perMaand(items: ContentItem[]) {
  const groepen = new Map<string, ContentItem[]>()
  for (const i of [...items].sort((a, b) => (a.datum ?? '9999').localeCompare(b.datum ?? '9999') || (a.tijd ?? '').localeCompare(b.tijd ?? ''))) {
    const k = i.datum ? i.datum.slice(0, 7) : 'zonder'
    groepen.set(k, [...(groepen.get(k) ?? []), i])
  }
  return [...groepen.entries()].map(([k, lijst]) => ({ k, titel: k === 'zonder' ? 'Nog geen datum' : `${MAANDEN[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`, lijst }))
}

export function StatusPil({ s }: { s: ContentStatus }) {
  return <span className={`badge content-status cs-${s}`}>{statusLabel(s)}</span>
}

/** Een item bij een klant opslaan of verwijderen (bron van de waarheid: client.contentKalender). */
export function useContentOpslaan() {
  const { s, d } = useStore()
  const opslaan = (clientId: string, i: ContentItem, oudeKlant?: string) => {
    const nieuw = { ...i, updatedAt: new Date().toISOString(), by: s.me }
    for (const c of s.clients) {
      const items = c.contentKalender ?? []
      if (c.id === clientId) {
        const kanalen = c.kanalen?.includes(i.kanaal) ? c.kanalen : [...(c.kanalen ?? []), i.kanaal]
        d({ type: 'client:upsert', client: { ...c, kanalen, contentKalender: items.some((x) => x.id === i.id) ? items.map((x) => (x.id === i.id ? nieuw : x)) : [...items, nieuw] } })
      } else if (c.id === oudeKlant && items.some((x) => x.id === i.id)) {
        d({ type: 'client:upsert', client: { ...c, contentKalender: items.filter((x) => x.id !== i.id) } })
      }
    }
  }
  const verwijder = (clientId: string, id: string) => {
    const c = s.clients.find((x) => x.id === clientId)
    const item = c?.contentKalender?.find((x) => x.id === id)
    item?.visuals?.forEach((v) => weghalen(v))
    if (c) d({ type: 'client:upsert', client: { ...c, contentKalender: (c.contentKalender ?? []).filter((x) => x.id !== id) } })
  }
  return { opslaan, verwijder }
}

/**
 * Contentkalender van één klant: een tabblad per kanaal, per maand de mails of posts met onderwerp en status.
 * Team (bewerken): toevoegen, aanpassen, status zetten. Klant (portaal): alleen lezen; de tekst pas vanaf de laatste versie.
 */
export function ContentKalender({ client, update, klant = false, openId }: { client: Client; update?: (p: Partial<Client>) => void; klant?: boolean; openId?: string }) {
  const { opslaan, verwijder } = useContentOpslaan()
  const kanalen = client.kanalen ?? []
  const items = client.contentKalender ?? []
  const [kanaal, setKanaal] = useState(kanalen[0] ?? '')
  const [open, setOpen] = useState<ContentItem | null>(null)
  const [verleden, setVerleden] = useState(false)
  useEffect(() => { if (!kanalen.includes(kanaal)) setKanaal(kanalen[0] ?? '') }, [kanalen.join('|')])
  // Vanuit de Planning of Productie: meteen het juiste item openen
  useEffect(() => {
    const i = openId && items.find((x) => x.id === openId)
    if (i) { setKanaal(i.kanaal); setOpen(i) }
  }, [openId])

  const bewerkbaar = Boolean(update) && !klant
  const vandaagMaand = new Date().toISOString().slice(0, 7)
  const vanKanaal = items.filter((i) => i.kanaal === kanaal)
  const oud = vanKanaal.filter((i) => i.datum && i.datum.slice(0, 7) < vandaagMaand)
  const zichtbaar = verleden ? vanKanaal : vanKanaal.filter((i) => !oud.includes(i))
  const groepen = perMaand(zichtbaar)

  if (!kanalen.length) return bewerkbaar ? <KanalenKiezer client={client} update={update!} /> : null

  return (
    <div className={`content-kalender ${klant ? 'voor-klant' : ''}`}>
      <div className="ck-kop">
        <div className="ck-tabs" role="tablist">
          {kanalen.map((k) => {
            const n = items.filter((i) => i.kanaal === k && !(i.datum && i.datum.slice(0, 7) < vandaagMaand)).length
            return (
              <button key={k} role="tab" aria-selected={kanaal === k} className={`ck-tab ${kanaal === k ? 'on' : ''}`} onClick={() => setKanaal(k)}>
                <Icon name={isMail(k) ? 'mail' : 'image'} size={14} /> {k} <span className="aantal">{n}</span>
              </button>
            )
          })}
        </div>
        {bewerkbaar && <button className="btn small primary" onClick={() => setOpen({ id: uid(), kanaal, titel: '', status: 'open' })}><Icon name="plus" size={14} /> {isMail(kanaal) ? 'Mail' : 'Post'}</button>}
      </div>

      {groepen.length === 0 && <p className="muted small ck-leeg">{bewerkbaar ? `Nog niets gepland voor ${kanaal}. Zet hier per maand de ${isMail(kanaal) ? 'mails' : 'posts'} neer.` : `Nog niets gepland voor ${kanaal}.`}</p>}
      {groepen.map((g) => (
        <section key={g.k} className="ck-maand">
          <h4 className="ck-maandkop">{g.titel} <span className="muted small">{g.lijst.length} {isMail(kanaal) ? (g.lijst.length === 1 ? 'mail' : 'mails') : g.lijst.length === 1 ? 'post' : 'posts'}</span></h4>
          <ul className="ck-lijst">
            {g.lijst.map((i) => (
              <li key={i.id}>
                <button className="ck-item" onClick={() => setOpen(i)}>
                  <span className="ck-datum">{i.datum ? datumTekst(i.datum, i.tijd) : 'Geen datum'}</span>
                  <span className="ck-titel">{(i.visuals?.length ?? 0) > 0 && <Icon name="image" size={13} />} {i.titel || <span className="muted">Nog geen onderwerp</span>}</span>
                  <StatusPil s={i.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {oud.length > 0 && <button className="link small" onClick={() => setVerleden(!verleden)}>{verleden ? 'Verberg' : 'Toon'} eerdere maanden ({oud.length})</button>}
      {bewerkbaar && <KanalenKiezer client={client} update={update!} compact />}

      {open && (bewerkbaar
        ? <ContentFormulier item={open} clientId={client.id} onClose={() => setOpen(null)}
            onSave={(i, k) => { opslaan(k, i, client.id); setOpen(null) }} onWeg={() => { verwijder(client.id, open.id); setOpen(null) }} bestaat={items.some((x) => x.id === open.id)} />
        : <ContentBekijken item={open} klant={klant} onClose={() => setOpen(null)} />)}
    </div>
  )
}

/** Welke kanalen heeft deze klant? */
function KanalenKiezer({ client, update, compact = false }: { client: Client; update: (p: Partial<Client>) => void; compact?: boolean }) {
  const [eigen, setEigen] = useState('')
  const [tonen, setTonen] = useState(!compact)
  const kanalen = client.kanalen ?? []
  const zet = (k: string) => update({ kanalen: kanalen.includes(k) ? kanalen.filter((x) => x !== k) : [...kanalen, k] })
  if (!tonen) return <button className="link small ck-kanalen-link" onClick={() => setTonen(true)}>Kanalen aanpassen</button>
  return (
    <div className="ck-kanalen">
      {!compact && <p className="muted small" style={{ marginTop: 0 }}>Kies de kanalen waarvoor we content maken. Elk kanaal krijgt een eigen tabblad, ook in het portaal.</p>}
      <div className="chips">
        {[...new Set([...STANDAARD_KANALEN, ...kanalen])].map((k) => <button key={k} className={`chip ${kanalen.includes(k) ? 'on' : ''}`} onClick={() => zet(k)}>{k}</button>)}
      </div>
      <div className="inline-form" style={{ marginTop: 8 }}>
        <input placeholder="Ander kanaal, bijv. YouTube" value={eigen} onChange={(e) => setEigen(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && eigen.trim()) { zet(eigen.trim()); setEigen('') } }} />
        <button className="btn small" disabled={!eigen.trim()} onClick={() => { zet(eigen.trim()); setEigen('') }}>Toevoegen</button>
        {compact && <button className="btn small ghost" onClick={() => setTonen(false)}>Klaar</button>}
      </div>
    </div>
  )
}

/** Afbeelding uit de opslag (tijdelijke link), of een link naar een ontwerp. */
export function VisualVoorbeeld({ b, alt, onWeg }: { b: Bestand; alt?: string; onWeg?: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let stop = false; openLink(b).then((u) => { if (!stop) setUrl(u) }); return () => { stop = true } }, [b.pad])
  const beeld = b.type.startsWith('image/')
  const video = b.type.startsWith('video/')
  return (
    <figure className="ck-visual">
      {url && beeld && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={alt || b.naam} /></a>}
      {url && video && <video src={url} controls preload="metadata" />}
      {(!url || (!beeld && !video)) && <a className="ck-visual-bestand" href={url ?? undefined} target="_blank" rel="noreferrer"><Icon name="clip" size={16} /> {b.naam}</a>}
      {onWeg && <button className="icon-btn ck-visual-weg" onClick={onWeg} aria-label={`${b.naam} weghalen`}><Icon name="x" size={13} /></button>}
    </figure>
  )
}

/**
 * Formulier voor een post of mail. Post: platform, visual (link of upload), titel, caption, alttekst.
 * Mail: kanaal, onderwerp, volledige mail. Beide: datum, tijd en status. Met klantkeuze als het vanuit Productie komt.
 */
export function ContentFormulier({ item, clientId, klantKiezen = false, soort, bestaat, onClose, onSave, onWeg }: {
  item: ContentItem; clientId?: string; klantKiezen?: boolean; soort?: 'mail' | 'post'; bestaat: boolean
  onClose: () => void; onSave: (i: ContentItem, clientId: string) => void; onWeg?: () => void
}) {
  const { s } = useStore()
  const [d, setD] = useState(item)
  const [klant, setKlant] = useState(clientId ?? '')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const zet = <K extends keyof ContentItem>(k: K, v: ContentItem[K]) => setD((x) => ({ ...x, [k]: v }))
  const mail = soort ? soort === 'mail' : isMail(d.kanaal)
  const client = s.clients.find((c) => c.id === klant)
  const kanaalOpties = [...new Set([...(client?.kanalen ?? []).filter((k) => isMail(k) === mail), ...(mail ? ['Maillijst'] : ['Instagram', 'LinkedIn', 'Facebook', 'TikTok']), d.kanaal].filter(Boolean))]
  useEffect(() => { if (!d.kanaal || isMail(d.kanaal) !== mail) zet('kanaal', kanaalOpties[0]) }, [mail, klant])

  const upload = async (files: FileList | null) => {
    if (!files?.length || !klant) return setFout(klant ? '' : 'Kies eerst de klant.')
    setBezig(true); setFout('')
    const nieuw: Bestand[] = []
    for (const f of Array.from(files)) {
      const r = await uploaden(`content/${klant}`, f, s.me)
      if (r.bestand) nieuw.push(r.bestand); else if (r.fout) setFout(r.fout)
    }
    setBezig(false)
    if (nieuw.length) zet('visuals', [...(d.visuals ?? []), ...nieuw])
  }
  const klaar = Boolean(d.titel.trim() && klant && d.kanaal)
  // Bestanden pas echt weghalen bij Opslaan; bij Annuleren alleen wat net geüpload is
  const ids = (l?: Bestand[]) => new Set((l ?? []).map((x) => x.id))
  const sluit = () => { const oud = ids(item.visuals); (d.visuals ?? []).filter((v) => !oud.has(v.id)).forEach((v) => weghalen(v)); onClose() }
  const bewaar = () => { const nu = ids(d.visuals); (item.visuals ?? []).filter((v) => !nu.has(v.id)).forEach((v) => weghalen(v)); onSave({ ...d, titel: d.titel.trim() }, klant) }

  const visualBlok = (
    <div className="block-label">{mail ? 'Afbeelding (optioneel)' : 'Visual'}
      <div className="ck-visuals">
        {(d.visuals ?? []).map((v) => <VisualVoorbeeld key={v.id} b={v} alt={d.alttekst} onWeg={() => zet('visuals', (d.visuals ?? []).filter((x) => x.id !== v.id))} />)}
        <button className="ck-visual-nieuw" onClick={() => ref.current?.click()} disabled={bezig}>
          <Icon name="upload" size={18} /><span>{bezig ? 'Uploaden…' : 'Bestand uploaden'}</span><span className="muted small">{mail ? 'beeld' : 'beeld of video'}, max {MAX_MB} MB</span>
        </button>
      </div>
      <input ref={ref} type="file" accept="image/*,video/*,application/pdf" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
      <input type="url" placeholder={mail ? 'Of een link: Canva, Drive, de mail in ActiveCampaign…' : 'Of een link: Canva, Drive, Frame.io…'} value={d.link ?? ''} onChange={(e) => zet('link', e.target.value.trim() || undefined)} />
      {fout && <span className="small danger-tekst">{fout}</span>}
    </div>
  )

  return (
    <Drawer open onClose={sluit} title={<><div className="drawer-kicker">{client?.name ?? 'Contentkalender'}{d.kanaal ? ` · ${d.kanaal}` : ''}</div>{bestaat ? d.titel || 'Zonder titel' : mail ? 'Nieuwe mail' : 'Nieuwe post'}</>}>
      <div className="ck-form">
        {klantKiezen && (
          <label className="block-label">Klant
            <select value={klant} onChange={(e) => setKlant(e.target.value)} className={klant ? '' : 'nog-kiezen'}>
              <option value="" disabled>Kies klant…</option>
              {s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <div className="ck-velden">
          <label>{mail ? 'Kanaal' : 'Platform'}
            <select value={d.kanaal} onChange={(e) => zet('kanaal', e.target.value)}>{kanaalOpties.map((k) => <option key={k}>{k}</option>)}</select>
          </label>
          <label>{mail ? 'Verzenden op' : 'Plaatsen op'}
            <input type="date" value={d.datum ?? ''} onChange={(e) => zet('datum', e.target.value || undefined)} />
          </label>
          <label>Tijd
            <input type="time" value={d.tijd ?? ''} onChange={(e) => zet('tijd', e.target.value || undefined)} />
          </label>
        </div>

        {!mail && visualBlok}

        <label className="block-label">{mail ? 'Onderwerp' : 'Titel'}
          <input autoFocus={!bestaat} value={d.titel} placeholder={mail ? 'Onderwerpregel van de mail' : 'Korte titel, bijv. "Kerstpost team"'} onChange={(e) => zet('titel', e.target.value)} />
        </label>
        <label className="block-label">{mail ? 'Volledige mail' : 'Caption'}
          <textarea rows={mail ? 12 : 7} value={d.inhoud ?? ''} placeholder={mail ? 'Aanhef, tekst, afsluiting…' : 'De tekst bij de post, met hashtags'} onChange={(e) => zet('inhoud', e.target.value || undefined)} />
          {!mail && d.inhoud && <span className="muted small">{d.inhoud.length} tekens{d.kanaal === 'Instagram' && d.inhoud.length > 2200 ? ' · Instagram staat max 2.200 toe' : ''}{d.kanaal === 'LinkedIn' && d.inhoud.length > 3000 ? ' · LinkedIn staat max 3.000 toe' : ''}</span>}
        </label>
        {!mail && (
          <label className="block-label">Alttekst
            <textarea rows={2} value={d.alttekst ?? ''} placeholder="Beschrijf wat er op de visual te zien is (voor wie hem niet kan zien)" onChange={(e) => zet('alttekst', e.target.value || undefined)} />
          </label>
        )}
        {mail && visualBlok}
        {mail && ((d.visuals?.length ?? 0) > 0 || d.link) && (
          <label className="block-label">Alttekst van de afbeelding
            <textarea rows={2} value={d.alttekst ?? ''} placeholder="Beschrijf wat er op de afbeelding te zien is" onChange={(e) => zet('alttekst', e.target.value || undefined)} />
          </label>
        )}
        <div className="block-label">Status
          <div className="ck-statussen">
            {CONTENT_STATUSSEN.map((x) => <button key={x.key} className={`chip cs-keuze cs-${x.key} ${d.status === x.key ? 'on' : ''}`} onClick={() => zet('status', x.key)}>{x.label}</button>)}
          </div>
          <span className="muted small">De klant ziet de tekst vanaf "Laatste versie" (als concept) en definitief bij "Klaar voor verzending".</span>
        </div>
      </div>
      <div className="drawer-actions">
        <button className="btn primary" onClick={bewaar} disabled={!klaar} title={klaar ? undefined : 'Vul de klant en een titel in'}>{bestaat ? 'Opslaan' : mail ? 'Mail toevoegen' : 'Post toevoegen'}</button>
        <button className="btn ghost" onClick={sluit}>Annuleren</button>
        {bestaat && onWeg && <button className="btn ghost danger taak-weg" onClick={() => window.confirm(`"${d.titel}" uit de contentkalender verwijderen?`) && onWeg()}>Verwijderen</button>}
      </div>
      {item.updatedAt && <p className="muted small">Laatst aangepast {item.by ? `door ${personName(item.by)} ` : ''}op {new Date(item.updatedAt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
    </Drawer>
  )
}

/** Lezen: de volledige mail of post. Voor de klant pas vanaf de laatste versie. */
export function ContentBekijken({ item, klant, onClose }: { item: ContentItem; klant: boolean; onClose: () => void }) {
  const mail = isMail(item.kanaal)
  const tonen = !klant || tekstZichtbaarVoorKlant(item)
  return (
    <Drawer open onClose={onClose} title={<><div className="drawer-kicker">{item.kanaal}{item.datum ? ` · ${datumTekst(item.datum, item.tijd)}` : ''}</div>{item.titel}</>}>
      <div className="ck-bekijk-kop">
        <StatusPil s={item.status} />
        {item.status !== 'klaar' && tonen && item.inhoud && <span className="badge ck-concept">Concept</span>}
      </div>
      {tonen && (item.visuals?.length ?? 0) > 0 && (
        <div className="ck-visuals groot">{item.visuals!.map((v) => <VisualVoorbeeld key={v.id} b={v} alt={item.alttekst} />)}</div>
      )}
      {tonen && item.inhoud ? (
        <div className={`ck-inhoud ${mail ? 'als-mail' : 'als-post'}`}>
          {mail && <div className="ck-mailkop"><span className="muted small">Onderwerp</span><strong>{item.titel}</strong></div>}
          <div className="ck-tekst">{item.inhoud}</div>
        </div>
      ) : (
        <div className="ck-nog-niet">
          <Icon name="note" size={20} />
          <p>{klant && !tonen ? `Deze ${mail ? 'mail' : 'post'} is nog in de maak. Je ziet de volledige tekst zodra de laatste versie klaarstaat.` : 'Nog geen tekst.'}</p>
        </div>
      )}
      {tonen && item.alttekst && (item.visuals?.length ?? 0) > 0 && <p className="small"><span className="muted">Alttekst:</span> {item.alttekst}</p>}
      {item.link && tonen && <a className="btn small" href={item.link} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> Bekijk het ontwerp</a>}
    </Drawer>
  )
}
