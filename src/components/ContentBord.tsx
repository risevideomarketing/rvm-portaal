import { useEffect, useState } from 'react'
import type { Client, ContentItem, ContentStatus } from '../data/types'
import { uid, useMag, useStore } from '../store'
import { CONTENT_STATUSSEN, ContentFormulier, StatusPil, datumTekst, isMail, useContentOpslaan } from './ContentKalender'
import { Icon } from './ui'

// Rise-palet: navy #08111F, papier #F5F5F5, mist #B2BFCA, slate #8895A8
const KOLOM: Record<ContentStatus, { kleur: string; bg: string; kolom: string }> = {
  open: { kleur: '#08111F', bg: '#FFFFFF', kolom: '#F5F5F5' },
  bezig: { kleur: '#08111F', bg: '#F5F5F5', kolom: '#F5F5F5' },
  v1: { kleur: '#08111F', bg: '#B2BFCA', kolom: '#F5F5F5' },
  laatste: { kleur: '#08111F', bg: '#8895A8', kolom: '#F5F5F5' },
  klaar: { kleur: '#FFFFFF', bg: '#08111F', kolom: '#F5F5F5' },
}

type Regel = { item: ContentItem; klant: Client }

/** Alle mails of posts van alle klanten (of één klant) uit de contentkalenders. */
export function contentVan(clients: Client[], soort: 'mail' | 'post', klant = 'all'): Regel[] {
  return clients
    .filter((c) => klant === 'all' || c.id === klant)
    .flatMap((c) => (c.contentKalender ?? []).filter((i) => isMail(i.kanaal) === (soort === 'mail')).map((item) => ({ item, klant: c })))
    .sort((a, b) => (a.item.datum ?? '9999').localeCompare(b.item.datum ?? '9999'))
}

/**
 * Productie voor mails en posts: een bord met de statussen van de contentkalender (zelfde gegevens als in het klantprofiel,
 * het portaal en de Planning). Sleep naar een andere status; + Nieuw opent het formulier.
 */
export function ContentBord({ soort, klant, weergave, nieuwOpen, onNieuwDicht }: { soort: 'mail' | 'post'; klant: string; weergave: 'bord' | 'lijst'; nieuwOpen: boolean; onNieuwDicht: () => void }) {
  const { s } = useStore()
  const kan = useMag()
  const { opslaan, verwijder } = useContentOpslaan()
  const [drag, setDrag] = useState<string | null>(null)
  const [open, setOpen] = useState<{ item: ContentItem; clientId?: string; bestaat: boolean } | null>(null)
  const regels = contentVan(s.clients, soort, klant)
  const mag = kan('klanten_bewerken')
  const nieuw = (status: ContentStatus = 'open') =>
    setOpen({ item: { id: uid(), kanaal: soort === 'mail' ? 'Maillijst' : '', titel: '', status }, clientId: klant !== 'all' ? klant : undefined, bestaat: false })
  useEffect(() => { if (nieuwOpen) { nieuw(); onNieuwDicht() } }, [nieuwOpen])

  const zetStatus = (id: string, status: ContentStatus) => {
    const r = regels.find((x) => x.item.id === id)
    if (r && r.item.status !== status) opslaan(r.klant.id, { ...r.item, status })
  }
  const Kaart = ({ r }: { r: Regel }) => (
    <div className="board-card content-kaart" draggable={mag} onDragStart={() => setDrag(r.item.id)} onDragEnd={() => setDrag(null)} onClick={() => setOpen({ item: r.item, clientId: r.klant.id, bestaat: true })}>
      <div className="muted small">{r.klant.name}</div>
      <div className="board-card-title">{r.item.titel}</div>
      <div className="kaart-labels">
        <span className="badge"><Icon name={isMail(r.item.kanaal) ? 'mail' : 'image'} size={11} /> {r.item.kanaal}</span>
        {(r.item.visuals?.length ?? 0) > 0 && <span className="badge" title="Visuals"><Icon name="clip" size={11} /> {r.item.visuals!.length}</span>}
        {r.item.inhoud && <span className="badge" title={soort === 'mail' ? 'Tekst geschreven' : 'Caption geschreven'}><Icon name="note" size={11} /> tekst</span>}
      </div>
      <div className="board-card-foot"><span className="small muted">{r.item.datum ? datumTekst(r.item.datum, r.item.tijd) : 'Nog geen datum'}</span></div>
    </div>
  )

  return (
    <>
      {weergave === 'bord' ? (
        <div className="board pipeline content-board">
          {CONTENT_STATUSSEN.map((st) => {
            const col = regels.filter((r) => r.item.status === st.key)
            const k = KOLOM[st.key]
            return (
              <div key={st.key} className={`board-col ${drag ? 'droppable' : ''}`} style={{ background: k.kolom }} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag) zetStatus(drag, st.key); setDrag(null) }}>
                <div className="board-col-head">
                  <span className="fase-pil" style={{ color: k.kleur, background: k.bg }}><i style={{ background: k.kleur }} />{st.label}</span>
                  <span className="count">{col.length}</span>
                </div>
                {col.map((r) => <Kaart key={r.item.id} r={r} />)}
                {mag && <button className="kolom-nieuw" onClick={() => nieuw(st.key)}><Icon name="plus" size={13} /> Nieuw</button>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card flush">
          <table className="table">
            <thead><tr><th>{soort === 'mail' ? 'Onderwerp' : 'Titel'}</th><th>Klant</th><th>{soort === 'mail' ? 'Kanaal' : 'Platform'}</th><th>Datum</th><th>Status</th></tr></thead>
            <tbody>
              {regels.map((r) => (
                <tr key={r.item.id} className="task-row" onClick={() => setOpen({ item: r.item, clientId: r.klant.id, bestaat: true })}>
                  <td className="task-title">{r.item.titel}</td>
                  <td className="muted">{r.klant.name}</td>
                  <td className="small">{r.item.kanaal}</td>
                  <td className="small muted">{r.item.datum ? datumTekst(r.item.datum, r.item.tijd) : '—'}</td>
                  <td><StatusPil s={r.item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {regels.length === 0 && <p className="muted small" style={{ padding: 16 }}>Nog geen {soort === 'mail' ? 'mails' : 'posts'}.</p>}
        </div>
      )}
      {open && (
        <ContentFormulier item={open.item} clientId={open.clientId} klantKiezen soort={soort} bestaat={open.bestaat}
          onClose={() => setOpen(null)}
          onSave={(i, k) => { opslaan(k, i, open.clientId); setOpen(null) }}
          onWeg={open.clientId ? () => { verwijder(open.clientId!, open.item.id); setOpen(null) } : undefined} />
      )}
    </>
  )
}
