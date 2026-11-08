import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { displayName, FIELDS, firstAt, KINDS, type Entity, type Relation } from '../../shared/model'
import { useBook } from '../BookContext'
import { api } from '../api'
import { Avatar, BackLink, useToast } from '../components/ui'
import { Icon } from '../components/Icon'
import EntityForm from './EntityForm'
import RelationForm from './RelationForm'

const GROUPS: [string, (r: Relation, other: Entity) => boolean][] = [
  ['Famille', (r) => r.category === 'Famille' || !!r.kin],
  ['Amour', (r) => r.category === 'Amoureuse'],
  ['Amis', (r) => r.category === 'Ami'],
  ['Travail', (r, o) => r.category === 'Professionnelle' && o.kind === 'character'],
  ['Adversaires', (r) => r.category === 'Ennemi'],
  ['Organisations', (_r, o) => o.kind === 'org'],
  ['Lieux', (_r, o) => o.kind === 'place'],
  ['Dates', (_r, o) => o.kind === 'event'],
  ['Autres liens', () => true]
]

// Ce que l'autre est pour moi : son rôle, sinon la précision, sinon la catégorie
const describe = (r: Relation, meIsFrom: boolean) => {
  const role = meIsFrom ? r.to_role : r.from_role
  return [role, r.label].filter(Boolean).join(' · ') || r.category
}

function Notes({ e, onSaved }: { e: Entity; onSaved: () => void }) {
  const toast = useToast()
  const [text, setText] = useState(e.notes)
  const [state, setState] = useState<'' | 'saving' | 'saved'>('')
  const saved = useRef(e.notes)

  useEffect(() => {
    if (text === saved.current) return
    const t = setTimeout(async () => {
      setState('saving')
      try {
        await api.updateEntity(e.id, { notes: text })
        saved.current = text
        setState('saved')
        onSaved()
      } catch (err) {
        setState('')
        toast((err as Error).message)
      }
    }, 900)
    return () => clearTimeout(t)
  }, [text, e.id, onSaved, toast])

  return (
    <div className="card stack gap6">
      <div className="hstack between">
        <label htmlFor="notes" className="small muted">
          Notes
        </label>
        <span className="small" style={{ color: 'var(--ok)' }}>
          {state === 'saving' ? 'enregistrement…' : state === 'saved' ? 'enregistré' : ''}
        </span>
      </div>
      <textarea
        id="notes"
        value={text}
        placeholder="Tes notes, elles s’enregistrent toutes seules…"
        onChange={(ev) => setText(ev.target.value)}
        style={{ border: 0, padding: 0, background: 'transparent', minHeight: 60, resize: 'vertical', outline: 'none', fontSize: 15, lineHeight: 1.5 }}
      />
    </div>
  )
}

export default function EntityView() {
  const { entityId = '' } = useParams()
  const { book, relations, byId, reload } = useBook()
  const navigate = useNavigate()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [relForm, setRelForm] = useState<Relation | 'new' | null>(null)
  const base = `/livre/${book.id}`
  const e = byId.get(entityId)
  if (!e) return <Navigate to={base} replace />

  const mine = relations.filter((r) => r.from_id === e.id || r.to_id === e.id)
  const hasFamily = mine.some((r) => r.kin)
  const facts = FIELDS[e.kind].filter(([k]) => e.data[k] && k !== 'first' && k !== 'alias')

  const grouped = new Map<string, { r: Relation; other: Entity }[]>()
  for (const r of mine) {
    const other = byId.get(r.from_id === e.id ? r.to_id : r.from_id)
    if (!other) continue
    const g = GROUPS.find(([, test]) => test(r, other))![0]
    grouped.set(g, [...(grouped.get(g) || []), { r, other }])
  }

  const remove = async () => {
    if (!confirm(`Supprimer la fiche de ${displayName(e)} et ses liens ?`)) return
    try {
      await api.deleteEntity(e.id)
      await reload()
      navigate(base, { replace: true })
    } catch (err) {
      toast((err as Error).message)
    }
  }

  return (
    <main className="screen">
      <div className="topbar">
        <BackLink to={base} label="Carnet" />
        <div className="right">
          {hasFamily && (
            <Link to={`${base}/arbre?focus=${e.id}`} className="iconbtn" aria-label="Voir dans l’arbre familial">
              <Icon name="tree" />
            </Link>
          )}
          <button className="iconbtn" aria-label="Modifier la fiche" onClick={() => setEditing(true)}>
            <Icon name="edit" size={18} />
          </button>
        </div>
      </div>

      <div className="stack gap14">
        <div className="hstack" style={{ gap: 14 }}>
          <Avatar e={e} size="lg" />
          <div className="stack" style={{ minWidth: 0 }}>
            <h1 className="display" style={{ fontSize: 27, margin: 0 }}>
              {displayName(e)}
            </h1>
            {e.data.alias && <div className="small" style={{ color: 'var(--soft)' }}>« {e.data.alias} »</div>}
          </div>
        </div>

        <div className="hstack wrap" style={{ gap: 6 }}>
          <span className={`badge k-${e.kind}`} style={{ color: '#fff' }}>
            {KINDS[e.kind].one}
          </span>
          {firstAt(e) && <span className="badge mono">Apparaît {firstAt(e)}</span>}
          {!!e.to_clarify && (
            <span className="badge warn">
              <Icon name="flag" size={12} stroke={2.5} /> À clarifier
            </span>
          )}
        </div>

        {facts.length > 0 && (
          <div className="card facts" style={{ padding: '4px 16px' }}>
            {facts.map(([k, label]) => (
              <div className="fact" key={k}>
                <span>{label}</span>
                <span>{e.data[k]}</span>
              </div>
            ))}
          </div>
        )}

        <Notes key={e.id} e={e} onSaved={reload} />

        <div className="hstack between mt8">
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 21, fontWeight: 800, margin: 0 }}>
            Liens <span className="mono small muted">{mine.length}</span>
          </h2>
          <button className="btn sm" onClick={() => setRelForm('new')}>
            <Icon name="plus" size={16} /> Lien
          </button>
        </div>
        {mine.length === 0 && <p className="muted small" style={{ margin: 0 }}>Aucun lien pour l’instant.</p>}
        {GROUPS.map(([g]) => {
          const items = grouped.get(g)
          if (!items) return null
          return (
            <section key={g} className="stack gap6">
              <div className="eyebrow">{g}</div>
              <div className="list" style={{ padding: '0 6px' }}>
                {items.map(({ r, other }) => (
                  <div key={r.id} className="row" style={{ cursor: 'default', padding: 0 }}>
                    <Link to={`${base}/fiche/${other.id}`} className="hstack" style={{ flex: 1, minWidth: 0, padding: '12px 8px', textDecoration: 'none', gap: 12 }}>
                      <span className={`dot k-${other.kind}`} />
                      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15 }}>{displayName(other)}</span>
                      <span className="small" style={{ color: 'var(--soft)', textAlign: 'right', maxWidth: '48%' }}>
                        {describe(r, r.from_id === e.id)}
                      </span>
                    </Link>
                    <button className="iconbtn" style={{ border: 0, background: 'transparent', width: 40 }} aria-label={`Modifier le lien avec ${displayName(other)}`} onClick={() => setRelForm(r)}>
                      <Icon name="edit" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )
        })}

        <button className="btn sm danger mt22" style={{ alignSelf: 'center' }} onClick={remove}>
          <Icon name="trash" size={16} /> Supprimer la fiche
        </button>
      </div>

      {editing && (
        <EntityForm
          bookId={book.id}
          entity={e}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false)
            await reload()
          }}
        />
      )}
      {relForm && (
        <RelationForm
          me={e}
          relation={relForm === 'new' ? undefined : relForm}
          onClose={() => setRelForm(null)}
          onSaved={async () => {
            setRelForm(null)
            await reload()
          }}
        />
      )}
    </main>
  )
}
