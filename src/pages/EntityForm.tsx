import { useState } from 'react'
import { FIELDS, KINDS, KIND_ORDER, NAME_LABEL, type Entity, type Kind, type Unit } from '../../shared/model'
import { api } from '../api'
import { Sheet, useToast } from '../components/ui'

// Création ou modification d'une fiche à la main
export default function EntityForm({ bookId, entity, kind: initialKind = 'character', defaultPage, unit = 'page', onClose, onSaved }: {
  bookId: string
  entity?: Entity
  kind?: Kind
  defaultPage?: number
  unit?: Unit
  onClose: () => void
  onSaved: (e: Entity) => void
}) {
  const toast = useToast()
  const [kind, setKind] = useState<Kind>(entity?.kind || initialKind)
  const [name, setName] = useState(entity?.name || '')
  const [data, setData] = useState<Record<string, string>>(entity?.data || {})
  const [notes, setNotes] = useState(entity?.notes || '')
  const byChapter = entity ? !!entity.first_chapter || (!entity.first_page && unit === 'chapter') : unit === 'chapter'
  const initial = entity ? (byChapter ? entity.first_chapter : entity.first_page) : defaultPage
  const [page, setPage] = useState(initial ? String(initial) : '')
  const [clarify, setClarify] = useState(!!entity?.to_clarify)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) return toast('Le nom est obligatoire.')
    setBusy(true)
    try {
      const payload = { name, data, notes, ...(byChapter ? { first_chapter: page ? Number(page) : null } : { first_page: page ? Number(page) : null }), to_clarify: clarify ? 1 : 0 }
      const saved = entity ? await api.updateEntity(entity.id, payload) : await api.addEntity(bookId, { ...payload, kind })
      onSaved(saved)
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Sheet title={entity ? 'Modifier la fiche' : 'Nouvelle fiche'} onClose={onClose}>
      {!entity && (
        <div className="chips" style={{ marginBottom: 14 }}>
          {KIND_ORDER.map((k) => (
            <button key={k} className="chip" aria-pressed={k === kind} onClick={() => setKind(k)}>
              {KINDS[k].one}
            </button>
          ))}
        </div>
      )}
      <div className="field">
        <label htmlFor="ef-name">{NAME_LABEL[kind]} *</label>
        <input id="ef-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {FIELDS[kind].map(([key, label, options]) => (
        <div className="field" key={key}>
          <label htmlFor={`ef-${key}`}>{label}</label>
          {options ? (
            <select id={`ef-${key}`} value={data[key] || ''} onChange={(e) => setData({ ...data, [key]: e.target.value })}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o || '—'}
                </option>
              ))}
            </select>
          ) : (
            <input id={`ef-${key}`} value={data[key] || ''} onChange={(e) => setData({ ...data, [key]: e.target.value })} />
          )}
        </div>
      ))}
      <div className="field">
        <label htmlFor="ef-page">Première apparition ({byChapter ? 'chapitre' : 'page'})</label>
        <input id="ef-page" type="number" inputMode="numeric" min="1" value={page} onChange={(e) => setPage(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ef-notes">Notes</label>
        <textarea id="ef-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <label className="check">
        <input type="checkbox" checked={clarify} onChange={(e) => setClarify(e.target.checked)} />
        À clarifier
      </label>
      <button className="btn primary block mt14" onClick={save} disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </Sheet>
  )
}
