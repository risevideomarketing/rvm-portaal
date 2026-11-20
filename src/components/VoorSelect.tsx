import type { Task } from '../data/types'
import { isKlant } from '../data/mock'
import { useStore } from '../store'

/** Waar een taak bij hoort, als één waarde: klant-id, 'p.<project-id>', 'c.<contact-id>' of '' (nog niet gekoppeld). */
export const voorVan = (t: Pick<Task, 'clientId' | 'contactId' | 'projectId'>, clients: { id: string; contactId?: string }[]) =>
  t.projectId ? `p.${t.projectId}` : t.clientId ?? clients.find((c) => c.contactId && c.contactId === t.contactId)?.id ?? (t.contactId ? `c.${t.contactId}` : '')

/** Is de taak gekoppeld aan een klant (CRM), een productie of een intern project? */
export const gekoppeld = (t: Pick<Task, 'clientId' | 'contactId' | 'projectId'>) => Boolean(t.clientId || t.contactId || t.projectId)

/**
 * Keuzelijst "Voor": klanten, producties, interne projecten en contacten uit het CRM (prospects).
 * Een taak hoort altijd ergens bij; de lege keuze is alleen een uitnodiging om te kiezen.
 */
export function VoorSelect({ value, onChange, leeg = 'Kies klant of project…' }: { value: string; onChange: (v: string) => void; leeg?: string }) {
  const { s } = useStore()
  const producties = s.projects.filter((p) => p.soort === 'productie')
  const intern = s.projects.filter((p) => p.soort !== 'productie')
  const prospects = s.contacts.filter((c) => !isKlant(c.stage) && c.stage !== 'afgehandeld' && !s.clients.some((k) => k.contactId === c.id))
  const klantNaam = (id?: string) => s.clients.find((c) => c.id === id)?.name
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} title="Voor welke klant of welk project?" className={value ? '' : 'nog-kiezen'}>
      <option value="" disabled={value !== ''}>{leeg}</option>
      {s.clients.length > 0 && (
        <optgroup label="Klanten">
          {s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      )}
      {producties.length > 0 && (
        <optgroup label="Productie">
          {producties.map((p) => <option key={p.id} value={`p.${p.id}`}>{klantNaam(p.clientId) ? `${klantNaam(p.clientId)} · ` : ''}{p.name}</option>)}
        </optgroup>
      )}
      {intern.length > 0 && (
        <optgroup label="Interne projecten">
          {intern.map((p) => <option key={p.id} value={`p.${p.id}`}>{p.name}</option>)}
        </optgroup>
      )}
      {prospects.length > 0 && (
        <optgroup label="CRM (prospects)">
          {prospects.map((c) => <option key={c.id} value={`c.${c.id}`}>{c.company}</option>)}
        </optgroup>
      )}
    </select>
  )
}
