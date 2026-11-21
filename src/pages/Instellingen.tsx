import { useEffect, useState } from 'react'
import { Avatar, Icon, PageHead, Segmented } from '../components/ui'
import { MELDINGEN, RECHTEN, RECHTEN_SJABLONEN } from '../data/mock'
import type { Melding, Niveau, Person, Recht, Rechten } from '../data/types'
import { alleGegevensExporteren, inlogmailSturen, mijnMeldingenOpslaan, teamOpslaan } from '../slack'
import { niveauVan, useBeheerder, useStore } from '../store'

export type Thema = 'licht' | 'donker' | 'systeem'
export type Kleur = 'rise' | 'oceaan' | 'bos' | 'terracotta' | 'pruim' | 'grafiet'
const THEMA_KEY = 'rise-dashboard-thema'
const KLEUR_KEY = 'rise-dashboard-kleur'
const ACHTERGROND_KEY = 'rise-dashboard-achtergrond'
type Achtergrond = 'verloop' | 'grijs' | 'creme'

export const KLEURTHEMAS: { key: Kleur; naam: string; kleur: string }[] = [
  { key: 'rise', naam: 'Rise', kleur: '#08111F' },
  { key: 'oceaan', naam: 'Oceaan', kleur: '#1E5A8C' },
  { key: 'bos', naam: 'Bos', kleur: '#2F5D4A' },
  { key: 'terracotta', naam: 'Terracotta', kleur: '#A4502F' },
  { key: 'pruim', naam: 'Pruim', kleur: '#5B3A6E' },
  { key: 'grafiet', naam: 'Grafiet', kleur: '#3A3F47' },
]

/** Thema en kleur toepassen op de pagina (data-theme en data-kleur op <html>). */
export function pasThemaToe(thema: Thema = (localStorage.getItem(THEMA_KEY) as Thema) || 'licht', kleur: Kleur = (localStorage.getItem(KLEUR_KEY) as Kleur) || 'rise') {
  const donker = thema === 'donker' || (thema === 'systeem' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = donker ? 'dark' : 'light'
  document.documentElement.dataset.kleur = kleur
  document.documentElement.dataset.achtergrond = localStorage.getItem(ACHTERGROND_KEY) || 'verloop'
}

export function Instellingen() {
  const beheerder = useBeheerder()
  return (
    <>
      <PageHead title="Instellingen" sub={beheerder ? 'Weergave, meldingen en wie in het team wat mag.' : 'Weergave en meldingen.'} />
      <Weergave />
      <Meldingen />
      {beheerder && <Team />}
      {beheerder && <Backup />}
    </>
  )
}

function Weergave() {
  const [thema, setThema] = useState<Thema>((localStorage.getItem(THEMA_KEY) as Thema) || 'licht')
  const [kleur, setKleur] = useState<Kleur>((localStorage.getItem(KLEUR_KEY) as Kleur) || 'rise')
  const [achtergrond, setAchtergrond] = useState<Achtergrond>((localStorage.getItem(ACHTERGROND_KEY) as Achtergrond) || 'verloop')
  useEffect(() => { localStorage.setItem(THEMA_KEY, thema); localStorage.setItem(KLEUR_KEY, kleur); localStorage.setItem(ACHTERGROND_KEY, achtergrond); pasThemaToe(thema, kleur) }, [thema, kleur, achtergrond])
  return (
    <div className="card instellingen-blok">
      <h3 className="section-title" style={{ marginTop: 0 }}>Weergave <span className="muted small">(alleen voor jou, op dit apparaat)</span></h3>
      <div className="instelling-rij">
        <strong>Licht of donker</strong>
        <Segmented value={thema} onChange={setThema} options={[{ value: 'licht', label: 'Licht' }, { value: 'donker', label: 'Donker' }, { value: 'systeem', label: 'Zoals je apparaat' }]} />
      </div>
      <div className="instelling-rij" style={{ marginTop: 14 }}>
        <div><strong>Achtergrond</strong><div className="muted small">Bij licht thema</div></div>
        <Segmented value={achtergrond} onChange={setAchtergrond} options={[{ value: 'verloop', label: 'Verloop' }, { value: 'grijs', label: 'Lichtgrijs' }, { value: 'creme', label: 'Crème' }]} />
      </div>
      <div className="instelling-rij" style={{ marginTop: 14 }}>
        <div><strong>Kleurthema</strong><div className="muted small">Zijbalk, knoppen en achtergrond</div></div>
        <div className="kleurstalen">
          {KLEURTHEMAS.map((k) => (
            <button key={k.key} className={`kleurstaal ${kleur === k.key ? 'aan' : ''}`} style={{ background: k.kleur }} onClick={() => setKleur(k.key)} title={k.naam} aria-label={`Kleurthema ${k.naam}`} aria-pressed={kleur === k.key}>
              {kleur === k.key && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Eigen Slack-meldingen aan of uit. */
function Meldingen() {
  const { s, d } = useStore()
  const ik = s.team.find((p) => p.id === s.me)
  const [m, setM] = useState<Partial<Record<Melding, boolean>>>(ik?.meldingen ?? {})
  const [melding, setMelding] = useState('')
  const zet = async (key: Melding, aan: boolean) => {
    const nieuw = { ...m, [key]: aan }
    setM(nieuw)
    setMelding('Opslaan…')
    if (s.live) {
      const r = await mijnMeldingenOpslaan(nieuw)
      if (!r.ok) return setMelding(r.fout ?? 'Opslaan lukte niet')
    }
    d({ type: 'team', team: s.team.map((p) => (p.id === s.me ? { ...p, meldingen: nieuw } : p)) })
    setMelding('Opgeslagen')
  }
  return (
    <div className="card instellingen-blok">
      <h3 className="section-title" style={{ marginTop: 0 }}>Meldingen in Slack <span className="muted small">(voor jou)</span></h3>
      {MELDINGEN.map((x) => (
        <label key={x.key} className="instelling-vink">
          <span>{x.label}</span>
          <input type="checkbox" checked={m[x.key] !== false} onChange={(e) => zet(x.key, e.target.checked)} />
        </label>
      ))}
      {melding && <p className="muted small" style={{ margin: '6px 0 0' }}>{melding}</p>}
    </div>
  )
}

interface Rij { id?: string; email: string; naam: string; functie: string; niveau: Niveau; rechten: Rechten; nieuw?: boolean }
const naarRij = (p: Person): Rij => ({ id: p.id, email: p.email ?? '', naam: p.name, functie: p.role, niveau: p.niveau ?? 'medewerker', rechten: { ...(p.rechten ?? {}) } })
const heeft = (r: Rij, recht: Recht) => r.niveau === 'admin' || (r.niveau !== 'uit' && (r.rechten[recht] ?? RECHTEN.find((x) => x.key === recht)!.standaard))
const NIVEAU_LABEL: Record<Niveau, string> = { admin: 'Beheerder', medewerker: 'Medewerker', uit: 'Toegang ingetrokken' }

/** Team: lijst met mensen; klik op iemand voor alle vinkjes. Eén knop Opslaan voor alle wijzigingen. */
function Team() {
  const { s, d } = useStore()
  const [rijen, setRijen] = useState<Rij[]>(() => s.team.map(naarRij))
  const [open, setOpen] = useState<number | null>(null)
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null)
  const [bezig, setBezig] = useState(false)
  const [aangepast, setAangepast] = useState(false)
  useEffect(() => { if (!aangepast) setRijen(s.team.map(naarRij)) }, [s.team, aangepast])

  const zet = (i: number, patch: Partial<Rij>) => { setAangepast(true); setMelding(null); setRijen(rijen.map((r, j) => (j === i ? { ...r, ...patch } : r))) }
  const voegToe = () => { setAangepast(true); setRijen([...rijen, { email: '', naam: '', functie: '', niveau: 'medewerker', rechten: {}, nieuw: true }]); setOpen(rijen.length) }
  const sjabloon = (i: number, naam: string) => {
    const sj = RECHTEN_SJABLONEN.find((x) => x.naam === naam)
    if (sj) zet(i, { rechten: Object.fromEntries(RECHTEN.map((r) => [r.key, sj.rechten.includes(r.key)])) })
  }

  const opslaan = async () => {
    const fout = rijen.find((r) => !r.naam.trim() || ((r.nieuw || s.live) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim())))
    if (fout) return setMelding({ ok: false, tekst: `Vul bij ${fout.naam || 'de nieuwe persoon'} een naam en een geldig mailadres in.` })
    if (!rijen.some((r) => r.niveau === 'admin')) return setMelding({ ok: false, tekst: 'Er moet minstens één beheerder overblijven.' })
    setBezig(true)
    setMelding(null)
    if (s.live) {
      const r = await teamOpslaan(rijen.map((x) => ({ email: x.email.trim().toLowerCase(), naam: x.naam.trim(), functie: x.functie.trim(), role: x.niveau, rechten: x.rechten })))
      setBezig(false)
      if (!r.ok) return setMelding({ ok: false, tekst: r.fout ?? 'Opslaan lukte niet.' })
    } else {
      const team: Person[] = rijen.map((x, i) => {
        const oud = s.team.find((p) => p.id === x.id)
        const id = x.id ?? x.naam.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        return { ...(oud ?? { initials: x.naam.slice(0, 2).toUpperCase(), color: ['#8E4EC6', '#E54666', '#0090FF', '#12A594'][i % 4] }), id, name: x.naam, role: x.functie || NIVEAU_LABEL[x.niveau], email: x.email, niveau: x.niveau, rechten: x.rechten } as Person
      })
      d({ type: 'team', team })
      setBezig(false)
    }
    setAangepast(false)
    const nieuw = rijen.filter((r) => r.nieuw)
    setMelding({ ok: true, tekst: nieuw.length ? `Opgeslagen. ${nieuw.map((r) => r.naam).join(', ')} ${nieuw.length === 1 ? 'krijgt' : 'krijgen'} een mail met hoe inloggen werkt (app.risevideomarketing.nl, code uit de mail).` : 'Opgeslagen. Wie het dashboard open heeft, ziet de nieuwe rechten na herladen.' })
  }

  const groepen = Array.from(new Set(RECHTEN.map((r) => r.groep)))
  return (
    <div className="card instellingen-blok">
      <div className="section-row" style={{ marginBottom: 6 }}>
        <h3 className="section-title" style={{ margin: 0 }}>Team en rechten</h3>
        <button className="btn small" onClick={voegToe}><Icon name="plus" size={14} /> Persoon</button>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>Beheerders mogen alles. Klik op een medewerker om precies te kiezen wat hij mag.</p>

      <div className="team-lijst">
        {rijen.map((r, i) => {
          const ik = r.id === s.me
          const isOpen = open === i
          const aantal = RECHTEN.filter((x) => heeft(r, x.key)).length
          return (
            <div key={r.id ?? `nieuw-${i}`} className={`team-persoon-kaart ${isOpen ? 'open' : ''} ${r.niveau === 'uit' ? 'uit' : ''}`}>
              <button className="team-persoon-kop" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
                {r.id ? <Avatar id={r.id} size={32} /> : <span className="avatar" style={{ width: 32, height: 32, background: '#8895A8', fontSize: 12 }}>{r.naam.slice(0, 2).toUpperCase() || '+'}</span>}
                <span className="team-persoon-naam"><strong>{r.naam || 'Nieuwe persoon'}{ik && <span className="muted small"> (jij)</span>}</strong><span className="muted small">{r.functie || r.email}</span></span>
                <span className={`badge niveau-${r.niveau}`}>{NIVEAU_LABEL[r.niveau]}</span>
                <span className="muted small team-aantal">{r.niveau === 'admin' ? 'alles' : r.niveau === 'uit' ? 'geen toegang' : `${aantal} van ${RECHTEN.length}`}</span>
                <Icon name="arrow" size={14} />
              </button>
              {isOpen && (
                <div className="team-detail">
                  {r.nieuw && (
                    <div className="team-nieuw-velden">
                      <input placeholder="Naam" value={r.naam} onChange={(e) => zet(i, { naam: e.target.value })} autoFocus />
                      <input placeholder="naam@risevideomarketing.nl" value={r.email} onChange={(e) => zet(i, { email: e.target.value })} />
                      <input placeholder="Functie (bijv. stagiair)" value={r.functie} onChange={(e) => zet(i, { functie: e.target.value })} />
                    </div>
                  )}
                  <div className="team-detail-kop">
                    <label>Niveau{' '}
                      <select value={r.niveau === 'uit' ? 'medewerker' : r.niveau} disabled={ik || r.niveau === 'uit'} onChange={(e) => zet(i, { niveau: e.target.value as Niveau })}>
                        <option value="admin">Beheerder</option>
                        <option value="medewerker">Medewerker</option>
                      </select>
                    </label>
                    {r.niveau === 'medewerker' && (
                      <label>Sjabloon{' '}
                        <select value="" onChange={(e) => sjabloon(i, e.target.value)}>
                          <option value="">Kies om toe te passen…</option>
                          {RECHTEN_SJABLONEN.map((sj) => <option key={sj.naam} value={sj.naam}>{sj.naam}: {sj.uitleg}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                  {r.niveau === 'admin' && <p className="muted small">Een beheerder mag alles, ook het team aanpassen.</p>}
                  {r.niveau === 'uit' && <p className="muted small">{r.naam} kan niet meer inloggen. Gegevens en taken blijven bewaard.</p>}
                  {r.niveau === 'medewerker' && groepen.map((g) => (
                    <div key={g} className="rechten-groep">
                      <div className="rechten-groep-titel">{g}</div>
                      {RECHTEN.filter((x) => x.groep === g).map((x) => (
                        <label key={x.key} className="instelling-vink">
                          <span>{x.label}{x.uitleg && <span className="muted small"> · {x.uitleg}</span>}</span>
                          <input type="checkbox" checked={heeft(r, x.key)} onChange={(e) => zet(i, { rechten: { ...r.rechten, [x.key]: e.target.checked } })} />
                        </label>
                      ))}
                    </div>
                  ))}
                  {!ik && !r.nieuw && (
                    <div className="team-detail-voet">
                      {r.niveau !== 'uit' && r.email && (
                        <button className="btn small" onClick={async () => {
                          if (!s.live) return setMelding({ ok: true, tekst: `Lokaal wordt er geen mail verstuurd. Live krijgt ${r.naam} de inlogmail op ${r.email}.` })
                          const x = await inlogmailSturen(r.email.trim().toLowerCase())
                          setMelding(x.ok ? { ok: true, tekst: `Inlogmail verstuurd naar ${r.email}.` } : { ok: false, tekst: x.fout ?? 'Versturen lukte niet.' })
                        }}>Inlogmail sturen</button>
                      )}
                      {r.niveau === 'uit' ? (
                        <button className="btn small" onClick={() => zet(i, { niveau: 'medewerker' })}>Toegang teruggeven</button>
                      ) : (
                        <button className="link small danger" onClick={() => confirm(`Toegang van ${r.naam} intrekken? Diegene kan dan niet meer inloggen. Gegevens blijven bewaard en je kunt het terugdraaien. Klik daarna op Opslaan.`) && zet(i, { niveau: 'uit' })}>Toegang intrekken…</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="instellingen-voet">
        <button className="btn primary" onClick={opslaan} disabled={bezig || !aangepast}>{bezig ? 'Opslaan…' : 'Opslaan'}</button>
        {aangepast && !bezig && <button className="btn ghost" onClick={() => { setAangepast(false); setRijen(s.team.map(naarRij)); setMelding(null) }}>Annuleren</button>}
        {melding && <span className="small" style={{ color: melding.ok ? 'var(--green)' : 'var(--red)' }}>{melding.tekst}</span>}
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>Jouw niveau: {NIVEAU_LABEL[niveauVan(s, s.me)]}.</p>
    </div>
  )
}

/** Back-up: elke nacht automatisch; hier ook zelf een volledige kopie downloaden. */
function Backup() {
  const { s } = useStore()
  const [melding, setMelding] = useState('')
  const download = async () => {
    setMelding('Kopie maken…')
    const r = await alleGegevensExporteren(s)
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rise-dashboard-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMelding(r.bron === 'server' ? 'Gedownload: volledige kopie uit de database.' : 'Gedownload: kopie van wat je nu in het dashboard ziet.')
  }
  return (
    <div className="card instellingen-blok">
      <h3 className="section-title" style={{ marginTop: 0 }}>Back-up</h3>
      <p className="muted small" style={{ marginTop: 0 }}>Elke nacht om 03:00 wordt automatisch een volledige kopie gemaakt (30 dagen bewaard, plus de 1e van elke maand). Hier kun je er ook zelf een downloaden.</p>
      <div className="instellingen-voet" style={{ marginTop: 0 }}>
        <button className="btn" onClick={download}><Icon name="note" size={14} /> Alles exporteren</button>
        {melding && <span className="muted small">{melding}</span>}
      </div>
    </div>
  )
}
