import { useEffect, useState } from 'react'
import { Icon, PageHead, Segmented } from '../components/ui'
import { agendaLijst } from '../slack'
import { AGENDA_URL } from '../utils'

/**
 * Planning = de echte Google Agenda, ingesloten (week of maand). Geen aparte agenda in de app:
 * deadlines van taken staan via de koppeling al in de Rise-agenda, afspraken en shoots in hun eigen agenda.
 * Je ziet de agenda's waar je in deze browser met je Google-account toegang toe hebt.
 */
export function Planning({ go }: { go: (r: string) => void }) {
  const [weergave, setWeergave] = useState<'WEEK' | 'MONTH' | 'AGENDA'>(() => (localStorage.getItem('rise-agenda-weergave') as 'WEEK' | 'MONTH' | 'AGENDA') || 'WEEK')
  const [agendas, setAgendas] = useState<{ naam: string; id: string }[] | null>(null)
  const [fout, setFout] = useState('')
  const donker = document.documentElement.dataset.theme === 'dark'

  useEffect(() => {
    agendaLijst().then((r) => {
      if ('fout' in r) { setFout(r.fout); setAgendas([]) } else setAgendas(r.agendas)
    })
  }, [])

  const zet = (w: typeof weergave) => { setWeergave(w); localStorage.setItem('rise-agenda-weergave', w) }
  const q = new URLSearchParams({ ctz: 'Europe/Amsterdam', mode: weergave, wkst: '2', hl: 'nl', showTitle: '0', showPrint: '0', showTz: '0', showCalendars: '1', showTabs: '1' })
  if (donker) q.set('bgcolor', '#0F1726')
  const src = `https://calendar.google.com/calendar/embed?${q}${(agendas ?? []).map((a) => `&src=${encodeURIComponent(a.id)}`).join('')}`

  return (
    <>
      <PageHead title="Agenda" sub={<>Je Google Agenda, live. Taken met een deadline staan automatisch in de Rise-agenda.</>}>
        <Segmented value={weergave} onChange={zet} options={[{ value: 'WEEK', label: 'Week' }, { value: 'MONTH', label: 'Maand' }, { value: 'AGENDA', label: 'Lijst' }]} />
        <a className="btn" href={AGENDA_URL} target="_blank" rel="noreferrer"><Icon name="calendar" size={16} /> Open in Google</a>
        <button className="btn primary" onClick={() => go('taken')}><Icon name="tasks" size={16} /> Taken</button>
      </PageHead>
      {agendas === null ? (
        <div className="card"><p className="muted">Agenda laden…</p></div>
      ) : agendas.length === 0 ? (
        <div className="card"><p className="muted">{fout ? `De agenda's konden niet geladen worden: ${fout}` : 'Er zijn nog geen agenda’s ingesteld (GOOGLE_AGENDAS in Netlify).'}</p></div>
      ) : (
        <div className="card flush google-agenda">
          <iframe key={src} title="Google Agenda" src={src} loading="lazy" />
        </div>
      )}
      <p className="muted small" style={{ marginTop: 8 }}>Zie je niets? Log in deze browser in met je Google-account van Rise; Google laat alleen agenda's zien waar jij toegang toe hebt.</p>
    </>
  )
}
