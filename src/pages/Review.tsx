import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { at, FIELDS, type SuggestedEntity } from '../../shared/model'
import { useBook } from '../BookContext'
import { api } from '../api'
import { Avatar, BackLink, useToast } from '../components/ui'
import { Icon } from '../components/Icon'

const fullName = (e: SuggestedEntity) => (e.kind === 'character' ? [e.data.first, e.name].filter(Boolean).join(' ') : e.name)
const describe = (e: SuggestedEntity) => [e.data.alias && `« ${e.data.alias} »`, e.data.job, e.data.age && `${e.data.age} ans`, e.data.usage, e.data.type, e.data.date, e.data.city].filter(Boolean).join(' · ')
const label = (k: string, kind: SuggestedEntity['kind'] | 'character') => FIELDS[kind].find(([key]) => key === k)?.[1] || k

export default function Review() {
  const { book, suggestions: s, setSuggestions, reload, byId } = useBook()
  const navigate = useNavigate()
  const toast = useToast()
  const [off, setOff] = useState<Record<string, boolean>>({})
  const [edits, setEdits] = useState<Record<string, SuggestedEntity>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const base = `/livre/${book.id}`

  const entities = useMemo(() => (s ? s.entities.map((e) => edits[e.key] || e) : []), [s, edits])
  if (!s) return <Navigate to={`${base}/page`} replace />

  const isOn = (key: string) => !off[key]
  const toggle = (key: string) => setOff({ ...off, [key]: isOn(key) })
  // Une relation vers une nouvelle fiche décochée ne peut pas être ajoutée
  const relBlocked = (ref: string) => ref.startsWith('new:') && !isOn(ref)

  const chosenEnt = entities.filter((e) => isOn(e.key))
  const chosenUpd = s.updates.filter((u) => isOn(u.id))
  const chosenRel = s.relations.filter((r) => isOn(r.key) && !relBlocked(r.from_ref) && !relBlocked(r.to_ref))
  const count = chosenEnt.length + chosenUpd.length + chosenRel.length
  const total = s.entities.length + s.updates.length + s.relations.length
  const allOn = total > 0 && Object.values(off).every((v) => !v)

  const setAll = (on: boolean) => {
    if (on) return setOff({})
    const next: Record<string, boolean> = {}
    s.entities.forEach((e) => (next[e.key] = true))
    s.updates.forEach((u) => (next[u.id] = true))
    s.relations.forEach((r) => (next[r.key] = true))
    setOff(next)
  }

  const apply = async () => {
    setBusy(true)
    try {
      const res = await api.apply(book.id, { unit: s.unit, at: s.to, entities: chosenEnt, updates: chosenUpd, relations: chosenRel })
      setSuggestions(null)
      await reload()
      toast(count ? `${count} élément${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''}` : `${s.unit === 'chapter' ? 'Chapitre' : 'Page'} ${s.to} enregistré${s.unit === 'chapter' ? '' : 'e'}`)
      navigate(base)
      return res
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  const src = (conf?: string, first?: number | null) =>
    s.source === 'epub' ? (
      <span className="src photo">Lu dans l’ebook · {at('chapter', first || s.to)}</span>
    ) : s.source === 'photo' ? (
      <span className="src photo">Photo · {at(s.unit, s.to)}</span>
    ) : (
      <span className="src">{conf === 'low' ? 'Mémoire IA · peu sûr' : 'Mémoire IA · à vérifier'}</span>
    )
  const upTo = at(s.unit, s.to)

  const groups: { title: string; items: SuggestedEntity[] }[] = [
    { title: 'Nouveaux personnages', items: entities.filter((e) => e.kind === 'character') },
    { title: 'Nouveaux lieux', items: entities.filter((e) => e.kind === 'place') },
    { title: 'Nouvelles organisations', items: entities.filter((e) => e.kind === 'org') },
    { title: 'Nouvelles dates', items: entities.filter((e) => e.kind === 'event') }
  ].filter((g) => g.items.length)

  return (
    <main className="screen">
      <div className="topbar">
        <BackLink to={`${base}/page`} label="Page" />
        {total > 0 && (
          <button className="back" onClick={() => setAll(!allOn)} style={{ fontWeight: 600, color: 'var(--soft)' }}>
            {allOn ? 'Tout décocher' : 'Tout cocher'}
          </button>
        )}
      </div>
      <div className="eyebrow">
        {s.from === s.to ? upTo : `${at(s.unit, s.from)} → ${s.to}`}
      </div>
      <h1 className="display" style={{ fontSize: 30 }}>
        {total ? `${total} nouveauté${total > 1 ? 's' : ''}` : 'Rien de nouveau'}
      </h1>

      <div className="banner mt14">
        <span style={{ color: 'var(--ok)', display: 'flex', marginTop: 1 }}>
          <Icon name="shield" size={18} />
        </span>
        <span>
          {total
            ? `Rien au-delà : ${upTo}. L'IA peut se tromper : décoche ce qui ne colle pas, rien n'est ajouté sans toi.${s.engine ? ` (Lu par ${s.engine}.)` : ''}`
            : s.source === 'memory' ? "L'IA ne connaît pas assez ce livre pour ce passage. Importe l'ebook ou prends une page en photo : elle lira le vrai texte." : "Rien de nouveau dans ce passage."}
        </span>
      </div>

      <div className="stack gap10" style={{ marginTop: 18 }}>
        {groups.map((g) => (
          <section key={g.title} className="stack gap6">
            <div className="eyebrow mt8">{g.title}</div>
            {g.items.map((e) => (
              <div key={e.key} className="stack gap6">
                <button className="sugg" aria-pressed={isOn(e.key)} onClick={() => toggle(e.key)}>
                  <span className="box">{isOn(e.key) && <Icon name="check" size={16} stroke={3} />}</span>
                  <Avatar e={e} />
                  <span className="stack" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>{fullName(e)}</span>
                    {describe(e) && <span className="small" style={{ color: 'var(--soft)' }}>{describe(e)}</span>}
                    {src(e.confidence, e.first_at)}
                  </span>
                </button>
                {isOn(e.key) &&
                  (editing === e.key ? (
                    <div className="card">
                      {e.kind === 'character' && (
                        <div className="field">
                          <label htmlFor={`f-${e.key}`}>Prénom</label>
                          <input id={`f-${e.key}`} value={e.data.first || ''} onChange={(ev) => setEdits({ ...edits, [e.key]: { ...e, data: { ...e.data, first: ev.target.value } } })} />
                        </div>
                      )}
                      <div className="field">
                        <label htmlFor={`n-${e.key}`}>{e.kind === 'character' ? 'Nom de famille' : 'Nom'}</label>
                        <input id={`n-${e.key}`} value={e.name} onChange={(ev) => setEdits({ ...edits, [e.key]: { ...e, name: ev.target.value } })} />
                      </div>
                      <button className="btn sm" onClick={() => setEditing(null)}>
                        OK
                      </button>
                    </div>
                  ) : (
                    <button className="back small" style={{ height: 32, alignSelf: 'flex-end', color: 'var(--soft)' }} onClick={() => setEditing(e.key)}>
                      <Icon name="edit" size={14} /> Corriger le nom
                    </button>
                  ))}
              </div>
            ))}
          </section>
        ))}

        {s.updates.length > 0 && (
          <section className="stack gap6">
            <div className="eyebrow mt8">Fiches existantes à compléter</div>
            {s.updates.map((u) => {
              const e = byId.get(u.id)
              if (!e) return null
              return (
                <button key={u.id} className="sugg" aria-pressed={isOn(u.id)} onClick={() => toggle(u.id)}>
                  <span className="box">{isOn(u.id) && <Icon name="check" size={16} stroke={3} />}</span>
                  <Avatar e={e} />
                  <span className="stack" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>{u.name}</span>
                    <span className="small" style={{ color: 'var(--soft)' }}>
                      {Object.entries(u.facts)
                        .map(([k, v]) => `+ ${label(k, e.kind)} : ${v}`)
                        .join(' · ')}
                    </span>
                    <span className="src photo" style={{ background: 'var(--chip)', color: 'var(--soft)' }}>
                      Déjà dans tes fiches
                    </span>
                  </span>
                </button>
              )
            })}
          </section>
        )}

        {s.relations.length > 0 && (
          <section className="stack gap6">
            <div className="eyebrow mt8">Nouveaux liens</div>
            {s.relations.map((r) => {
              const blocked = relBlocked(r.from_ref) || relBlocked(r.to_ref)
              const on = isOn(r.key) && !blocked
              const roles = [r.from_role, r.to_role].filter(Boolean).join(' · ')
              return (
                <button key={r.key} className="sugg" aria-pressed={on} disabled={blocked} onClick={() => toggle(r.key)}>
                  <span className="box">{on && <Icon name="check" size={16} stroke={3} />}</span>
                  <span className="avatar sq" style={{ background: 'var(--sel)', color: 'var(--selink)' }} aria-hidden="true">
                    ⇄
                  </span>
                  <span className="stack" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>
                      {r.from_name} ⇄ {r.to_name}
                    </span>
                    <span className="small" style={{ color: 'var(--soft)' }}>
                      {roles || r.category}
                    </span>
                    {blocked ? <span className="src">Coche d’abord la fiche concernée</span> : src()}
                  </span>
                </button>
              )
            })}
          </section>
        )}
      </div>

      <div className="dock">
        <div className="inner">
          <button className="btn primary" onClick={apply} disabled={busy}>
            <Icon name="check" />
            {busy ? 'Ajout…' : count ? `Ajouter ${count} élément${count > 1 ? 's' : ''}` : `Enregistrer : ${upTo}`}
          </button>
        </div>
      </div>
      {total === 0 && (
        <p className="small muted" style={{ textAlign: 'center' }}>
          <Link to={`${base}/page`}>Réessayer avec une photo</Link>
        </p>
      )}
    </main>
  )
}
