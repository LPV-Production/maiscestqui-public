import { useMemo, useState } from 'react'
import { CATEGORIES, displayName, norm, type Entity, type Kin, type Relation } from '../../shared/model'
import { api } from '../api'
import { Avatar, Sheet, useToast } from '../components/ui'
import { useBook } from '../BookContext'

type KinChoice = '' | 'me-parent' | 'other-parent' | 'spouse' | 'sibling'

// Ajoute ou modifie un lien entre la fiche « me » et une autre, lisible dans les deux sens
export default function RelationForm({ me, relation, onClose, onSaved }: { me: Entity; relation?: Relation; onClose: () => void; onSaved: () => void }) {
  const { book, entities, byId } = useBook()
  const toast = useToast()
  const flipped = relation ? relation.to_id === me.id : false
  const [otherId, setOtherId] = useState(relation ? (flipped ? relation.from_id : relation.to_id) : '')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState(relation?.category || 'Famille')
  const [myRole, setMyRole] = useState(relation ? (flipped ? relation.to_role : relation.from_role) : '')
  const [otherRole, setOtherRole] = useState(relation ? (flipped ? relation.from_role : relation.to_role) : '')
  const [labelText, setLabelText] = useState(relation?.label || '')
  const [kin, setKin] = useState<KinChoice>(() => {
    if (!relation?.kin) return ''
    if (relation.kin === 'parent') return (relation.from_id === me.id) ? 'me-parent' : 'other-parent'
    return relation.kin
  })
  const [busy, setBusy] = useState(false)

  const other = byId.get(otherId)
  const candidates = useMemo(() => {
    const nq = norm(q)
    return entities.filter((e) => e.id !== me.id && (!nq || norm(displayName(e) + ' ' + (e.data.alias || '')).includes(nq))).slice(0, 30)
  }, [entities, q, me.id])

  const save = async () => {
    if (!otherId) return toast('Choisis la fiche à relier.')
    setBusy(true)
    // Le lien est stocké de « me » vers l'autre, sauf si l'autre est le parent
    const otherIsParent = kin === 'other-parent'
    const from = otherIsParent ? otherId : me.id
    const to = otherIsParent ? me.id : otherId
    const payload: Partial<Relation> = {
      from_id: from,
      to_id: to,
      category,
      from_role: otherIsParent ? otherRole : myRole,
      to_role: otherIsParent ? myRole : otherRole,
      label: labelText,
      kin: (kin === 'me-parent' || kin === 'other-parent' ? 'parent' : kin || null) as Kin | null
    }
    try {
      if (relation) await api.updateRelation(relation.id, payload)
      else await api.addRelation(book.id, payload)
      onSaved()
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!relation || !confirm('Retirer ce lien ?')) return
    try {
      await api.deleteRelation(relation.id)
      onSaved()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const myName = displayName(me)
  const otherName = other ? displayName(other) : 'l’autre'

  return (
    <Sheet title={relation ? 'Modifier le lien' : 'Nouveau lien'} onClose={onClose}>
      {other ? (
        <div className="card hstack" style={{ marginBottom: 12 }}>
          <Avatar e={other} />
          <span style={{ flex: 1, fontWeight: 600 }}>{otherName}</span>
          {!relation && (
            <button className="btn sm" onClick={() => setOtherId('')}>
              Changer
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="rf-q">Relier {myName} à…</label>
            <input id="rf-q" autoFocus type="search" placeholder="Nom, surnom…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="list" style={{ marginBottom: 12, maxHeight: 280, overflowY: 'auto' }}>
            {candidates.map((e) => (
              <button key={e.id} className="row" onClick={() => setOtherId(e.id)}>
                <Avatar e={e} size="sm" />
                <span className="grow">
                  <span className="title">{displayName(e)}</span>
                </span>
              </button>
            ))}
            {candidates.length === 0 && <p className="muted small">Aucune fiche trouvée.</p>}
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="rf-cat">Type de lien</label>
        <select id="rf-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
          {[...new Set([...CATEGORIES, category])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="rf-other">{otherName} est … pour {myName}</label>
        <input id="rf-other" placeholder="ex. sa sœur, son patron" value={otherRole} onChange={(e) => setOtherRole(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="rf-me">{myName} est … pour {otherName}</label>
        <input id="rf-me" placeholder="ex. son frère, son employé" value={myRole} onChange={(e) => setMyRole(e.target.value)} />
      </div>
      {category === 'Famille' && (
        <div className="field">
          <label htmlFor="rf-kin">Pour l’arbre familial</label>
          <select id="rf-kin" value={kin} onChange={(e) => setKin(e.target.value as KinChoice)}>
            <option value="">Autre lien de famille</option>
            <option value="other-parent">{otherName} est le parent de {myName}</option>
            <option value="me-parent">{myName} est le parent de {otherName}</option>
            <option value="spouse">Mariés / en couple</option>
            <option value="sibling">Frère / sœur</option>
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="rf-label">Précision (facultatif)</label>
        <input id="rf-label" value={labelText} onChange={(e) => setLabelText(e.target.value)} />
      </div>
      <button className="btn primary block" onClick={save} disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      {relation && (
        <div className="hstack mt14" style={{ justifyContent: 'center' }}>
          <button className="btn sm danger" onClick={remove}>
            Retirer ce lien
          </button>
        </div>
      )}
    </Sheet>
  )
}
