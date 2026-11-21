import { Opdrachten } from './pages/Opdrachten'
import { useEffect, useState } from 'react'
import { Avatar, Icon } from './components/ui'
import { TEAM } from './data/mock'
import type { PersonId, Recht } from './data/types'
import { LANGS, t } from './i18n'
import { Crm } from './pages/Crm'
import { Kennisbank } from './pages/Kennisbank'
import { Klanten } from './pages/Klanten'
import { Overzicht } from './pages/Overzicht'
import { AlsKlant, Portaal } from './pages/Portaal'
import { Projecten } from './pages/Projecten'
import { supabase } from './supabase'
import { opTodo } from './utils'
import { Statistieken } from './pages/Statistieken'
import { Instellingen } from './pages/Instellingen'
import { Taken } from './pages/Taken'
import { Planning } from './pages/Planning'
import { mag, niveauVan, useStore } from './store'
import { OngedaanMelding } from './components/Ongedaan'
import { koppelingStatus, type StatusCheck } from './slack'

/** Menu in drie groepen: werkomgeving, klanten en projecten, beheer (zie T.groepen). */
const NAV: { key: string; icon: string; groep: 0 | 1 }[] = [
  { key: '', icon: 'home', groep: 0 },
  { key: 'taken', icon: 'tasks', groep: 0 },
  { key: 'planning', icon: 'calendar', groep: 0 },
  { key: 'opdrachten', icon: 'search', groep: 0 },
  { key: 'crm', icon: 'crm', groep: 1 },
  { key: 'productie', icon: 'film', groep: 1 },
  { key: 'projecten', icon: 'board', groep: 1 },
  { key: 'statistieken', icon: 'chart', groep: 1 },
  { key: 'kennisbank', icon: 'book', groep: 1 },
]

/** Welke pagina bij welk recht hoort (zonder recht: niet in het menu en dicht). */
const RECHT_VOOR: Record<string, Recht | undefined> = { statistieken: 'statistieken', crm: 'crm', productie: 'projecten', projecten: 'projecten' }

const getRoute = () => window.location.hash.replace(/^#\/?/, '')

export function App() {
  const { s, d } = useStore()
  const T = t(s.lang)
  const [route, setRoute] = useState(getRoute())
  // Mobiel: menu als uitschuifpaneel; dicht na elke klik
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const f = () => { setRoute(getRoute()); window.scrollTo(0, 0); setMenuOpen(false) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  const go = (r: string) => { window.location.hash = `/${r}` }
  // Mobiel: lege tabelcellen ("—") verbergen, zodat rijen compact blijven
  useEffect(() => {
    const markeer = () => document.querySelectorAll('.table td').forEach((td) => td.classList.toggle('leeg', td.textContent?.trim() === '—'))
    const o = new MutationObserver(markeer)
    o.observe(document.body, { childList: true, subtree: true, characterData: true })
    markeer()
    return () => o.disconnect()
  }, [])
  const [section, id, mode, sub] = route.split('/')
  const openCount = s.tasks.filter((t) => opTodo(t) && t.status !== 'klaar' && t.assignee === s.me).length

  // Portaal precies zoals de klant het ziet: zonder zijbalk, eigen pagina
  if (section === 'portaal' && (mode === 'als-klant' || mode === 'kaal')) return <AlsKlant id={id} kaal={mode === 'kaal'} go={go} />

  let page
  switch (section) {
    case 'taken': page = <Taken key="taken" klant={id} go={go} />; break
    case 'planning': page = <Planning go={go} />; break
    case 'opdrachten': page = <Opdrachten go={go} />; break
    // Klantprofiel hoort bij het CRM; zonder id ga je naar het CRM zelf
    case 'klanten': page = !id ? (mag(s, 'crm') ? <Crm go={go} /> : <GeenToegang />) : mag(s, 'klanten') ? <Klanten id={id} go={go} contentItem={mode === 'content' ? sub : undefined} /> : <GeenToegang />; break
    case 'productie': page = mag(s, 'projecten') ? <Projecten key="productie" soort="productie" id={id} go={go} /> : <GeenToegang />; break
    case 'projecten': page = mag(s, 'projecten') ? <Projecten key="intern" soort="intern" id={id} go={go} /> : <GeenToegang />; break
    case 'crm': page = mag(s, 'crm') ? <Crm go={go} weergave={id === 'contacten' ? 'contacten' : 'pipeline'} /> : <GeenToegang />; break
    case 'statistieken': page = mag(s, 'statistieken') ? <Statistieken go={go} /> : <GeenToegang />; break
    case 'instellingen': page = <Instellingen />; break
    case 'kennisbank': page = <Kennisbank id={id} go={go} />; break
    case 'portaal': page = <Portaal id={id} go={go} />; break
    default: page = <Overzicht go={go} />
  }

  const tabs: { key: string; icon: string; label: string }[] = [
    { key: '', icon: 'home', label: T.nav[''] },
    { key: 'taken', icon: 'tasks', label: T.nav.taken },
    { key: 'planning', icon: 'calendar', label: T.nav.planning },
    ...(mag(s, 'crm') ? [{ key: 'crm', icon: 'crm', label: T.nav.crm }] : []),
  ]
  const actief = (key: string) => section === key || (!section && !key) || (section === 'klanten' && key === 'crm')
  
  return (
    <div className={`shell ${menuOpen ? 'menu-open' : ''}`}>
      <header className="mobiel-balk">
        <button className="mobiel-menuknop" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Menu sluiten' : 'Menu openen'} aria-expanded={menuOpen}>
          <Icon name={menuOpen ? 'x' : 'list'} size={28} />
        </button>
        <a className="brand" href="#/"><img src="/img/logo-wit.png" alt="Rise" /></a>
        <span aria-hidden="true" />
      </header>
      <div className="menu-achtergrond" onClick={() => setMenuOpen(false)} />
      <aside className="sidebar">
        <a className="brand" href="#/"><img src="/img/logo-wit.png" alt="Rise Video Marketing" /></a>
        <div className="env">app.risevideomarketing.nl</div>
        <nav>
          {([0, 1] as const).map((g) => (
            <div key={g} className="nav-groep">
              <div className="nav-sep">{T.groepen[g]}</div>
              {NAV.filter((n) => n.groep === g && (!RECHT_VOOR[n.key] || mag(s, RECHT_VOOR[n.key]!))).map((n) => (
                <a key={n.key} href={`#/${n.key}`} className={section === n.key || (!section && !n.key) || (section === 'klanten' && n.key === 'crm') ? 'active' : ''}>
                  <Icon name={n.icon} />
                  <span>{T.nav[n.key]}</span>
                  {n.key === 'taken' && openCount > 0 && <span className="nav-count">{openCount}</span>}
                </a>
              ))}
            </div>
          ))}
          <div className="nav-sep">{T.groepen[2]}</div>
          <a href="#/portaal" className={section === 'portaal' ? 'active' : ''}>
            <Icon name="portal" />
            <span>{T.portaal}</span>
          </a>
          <a href="#/instellingen" className={section === 'instellingen' ? 'active' : ''}>
            <Icon name="settings" />
            <span>{s.lang === 'en' ? 'Settings' : 'Instellingen'}</span>
          </a>
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <Avatar id={s.me} size={30} />
            <div>
              {s.live ? (
                <div className="me-name">{TEAM.find((p) => p.id === s.me)?.name}</div>
              ) : (
                <select value={s.me} onChange={(e) => d({ type: 'me', me: e.target.value as PersonId })} aria-label={T.loggedInAs}>
                  {TEAM.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <div className="me-role">{TEAM.find((p) => p.id === s.me)?.role} · {niveauVan(s, s.me) === 'admin' ? (s.lang === 'en' ? 'admin' : 'beheerder') : (s.lang === 'en' ? 'member' : 'medewerker')}</div>
            </div>
          </div>
          <div className="lang-switch" role="group" aria-label="Taal">
            {LANGS.map((l) => (
              <button key={l.value} className={s.lang === l.value ? 'on' : ''} onClick={() => d({ type: 'lang', lang: l.value })}>
                {l.label}
              </button>
            ))}
          </div>
          {s.live ? (
            <button className="reset" onClick={() => supabase?.auth.signOut()}>
              <Icon name="lock" size={13} /> {s.lang === 'en' ? 'Log out' : 'Uitloggen'}
            </button>
          ) : (
            <button className="reset" onClick={() => { if (confirm(T.resetConfirm)) d({ type: 'reset' }) }}>
              <Icon name="refresh" size={13} /> {T.resetLabel}
            </button>
          )}
        </div>
      </aside>
      <main className="main">
        {s.live ? <StatusBalk ready={s.ready} /> : <div className="proto-banner">{T.protoBanner}</div>}
        <div className="content">{page}</div>
      </main>
      <OngedaanMelding />
      <nav className="tabbalk" aria-label="Snelmenu">
        {tabs.map((t) => (
          <a key={t.key} href={`#/${t.key}`} className={actief(t.key) && !menuOpen ? 'active' : ''}>
            <span className="tab-icoon"><Icon name={t.icon} size={21} />{t.key === 'taken' && openCount > 0 && <i className="tab-telling">{openCount}</i>}</span>
            <span>{t.label}</span>
          </a>
        ))}
        <button className={menuOpen || (!tabs.some((t) => actief(t.key))) ? 'active' : ''} onClick={() => setMenuOpen(!menuOpen)}>
          <span className="tab-icoon"><Icon name="list" size={21} /></span>
          <span>{s.lang === 'en' ? 'More' : 'Meer'}</span>
        </button>
      </nav>
    </div>
  )
}

/** Voor wie een pagina niet mag zien (bijv. statistieken zonder dat recht). */
function GeenToegang() {
  return (
    <div className="card leeg-staat" style={{ marginTop: 24 }}>
      <div className="leeg-icoon"><Icon name="lock" size={20} /></div>
      <strong>Deze pagina staat niet voor je open</strong>
      <p className="muted small">Vraag Daan om toegang via Instellingen.</p>
    </div>
  )
}

/** Statusbalk: test elke 5 minuten of alle koppelingen echt werken (database, Slack, Moneybird, agenda, mail, Meta). */
function StatusBalk({ ready }: { ready: boolean }) {
  const [checks, setChecks] = useState<StatusCheck[] | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let weg = false
    const laad = () => koppelingStatus().then((r) => { if (!weg && r && 'checks' in r) setChecks(r.checks) }).catch(() => {})
    laad()
    const i = setInterval(laad, 5 * 60_000)
    return () => { weg = true; clearInterval(i) }
  }, [])
  const kapot = checks?.filter((c) => !c.ok) ?? []
  const klasse = !ready || !checks ? '' : kapot.length ? 'waarschuwing' : 'live'
  const tekst = !ready ? 'Gegevens laden…' : !checks ? 'Koppelingen controleren…' : kapot.length ? `Niet gekoppeld: ${kapot.map((c) => c.naam).join(', ')}` : 'Live · alles gekoppeld en werkend'
  return (
    <div className={`proto-banner status-balk ${klasse}`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>{tekst}</button>
      {open && checks && (
        <ul className="status-lijst">
          {checks.map((c) => <li key={c.naam}><span className={c.ok ? 'status-stip ok' : 'status-stip'} />{c.naam}<span className="muted">{c.uitleg}</span></li>)}
        </ul>
      )}
    </div>
  )
}
