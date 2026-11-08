import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { displayName, norm } from '../../shared/model'
import { useBook } from '../BookContext'
import { BackLink } from '../components/ui'
import { Icon } from '../components/Icon'
import { buildFamilies, layoutFamily } from '../lib/family'

const W = 104, H = 52, GAP = 10, V = 40, PAD = 20

export default function Tree() {
  const { book, entities, relations, byId } = useBook()
  const [params, setParams] = useSearchParams()
  const [mode, setMode] = useState<'focus' | 'all'>('focus')
  const [q, setQ] = useState('')
  const base = `/livre/${book.id}`
  const g = useMemo(() => buildFamilies(entities, relations), [entities, relations])
  const overview = useRef<HTMLDivElement>(null)

  const requested = params.get('focus') || ''
  const focusId = g.familyOf.has(requested) ? requested : g.families[0]?.members.find((id) => !g.primaryParent(id)) || g.families[0]?.members[0]
  const fam = focusId ? g.familyOf.get(focusId)! : null
  // En vue d'ensemble, on fait défiler jusqu'à la personne sélectionnée
  useEffect(() => {
    const el = overview.current?.querySelector<HTMLElement>('.node.sel')
    el?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [mode, focusId])
  const go = (id: string) => {
    setParams({ focus: id })
    setMode('focus')
    setQ('')
    window.scrollTo(0, 0)
  }
  const name = (id: string) => (byId.get(id) ? displayName(byId.get(id)!) : '?')
  const first = (id: string) => byId.get(id)?.data.first || name(id)
  const meta = (id: string) => {
    const e = byId.get(id)
    if (!e) return ''
    return [e.data.status === 'Mort' ? '†' : '', e.data.age && `${e.data.age} ans`, e.data.job].filter(Boolean).join(' · ')
  }
  const fiche = (id: string) => `${base}/fiche/${id}`

  const matches = useMemo(() => {
    const nq = norm(q)
    if (!nq) return []
    return [...g.familyOf.keys()].filter((id) => norm(name(id)).includes(nq)).slice(0, 8)
  }, [q, g])

  if (!fam || !focusId)
    return (
      <main className="screen">
        <div className="topbar">
          <BackLink to={base} label="Carnet" />
        </div>
        <h1 className="display">Familles</h1>
        <p className="muted">
          Aucun lien de parenté pour l’instant. Sur une fiche, ajoute un lien de type « Famille » en précisant qui est le parent, le conjoint ou le frère / la sœur : l’arbre se construit tout seul.
        </p>
      </main>
    )

  const parents = g.parents(focusId)
  const spouses = g.spouses(focusId)
  const sibs = g.siblings(focusId)
  const kids = g.children(focusId)
  const chain = g.lineage(focusId)
  const layout = mode === 'all' ? layoutFamily(g, fam, W, H, GAP, V, PAD) : null
  const chainSet = new Set(chain)

  const centerBtn = (id: string, size = 18) => (
    <button className="center" onClick={() => go(id)} aria-label={`Centrer l’arbre sur ${name(id)}`}>
      <Icon name="tree" size={size} />
    </button>
  )

  return (
    <main className="screen">
      <div className="topbar">
        <BackLink to={base} label="Carnet" />
        <div className="seg">
          <button aria-pressed={mode === 'focus'} onClick={() => setMode('focus')}>
            Autour de
          </button>
          <button aria-pressed={mode === 'all'} onClick={() => setMode('all')}>
            Ensemble
          </button>
        </div>
      </div>

      <h1 className="display" style={{ fontSize: 28 }}>
        Famille {fam.name}
      </h1>

      {g.families.length > 1 && (
        <div className="chips mt8">
          {g.families.map((f) => (
            <button key={f.id} className="chip" aria-pressed={f === fam} onClick={() => go(f.members.find((id) => !g.primaryParent(id)) || f.members[0])}>
              {f.name} · {f.members.length}
            </button>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }} className="mt8">
        <div className="search" style={{ height: 44 }}>
          <Icon name="search" size={18} />
          <label htmlFor="tree-q" className="sr">
            Aller à une personne
          </label>
          <input id="tree-q" type="search" placeholder={`Aller à… (${g.familyOf.size} personnes)`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {matches.length > 0 && (
          <div className="list" style={{ position: 'absolute', left: 0, right: 0, top: 48, zIndex: 4, boxShadow: 'var(--shadow)' }}>
            {matches.map((id) => (
              <button key={id} className="row" style={{ minHeight: 48 }} onClick={() => go(id)}>
                <span className="grow">
                  <span className="title">{name(id)}</span>
                  <span className="sub">Famille {g.familyOf.get(id)!.name}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === 'focus' ? (
        <>
          <div className="hstack wrap mt14" style={{ gap: 4, fontSize: 13 }}>
            <span className="muted" style={{ marginRight: 2 }}>
              Lignée :
            </span>
            {chain.map((id, i) => (
              <span key={id} className="hstack" style={{ gap: 4 }}>
                <button className="crumb" aria-current={id === focusId} onClick={() => go(id)}>
                  {first(id)}
                </button>
                {i < chain.length - 1 && (
                  <span aria-hidden="true" style={{ color: 'var(--faint)' }}>
                    ›
                  </span>
                )}
              </span>
            ))}
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ textAlign: 'center', fontSize: 11, marginBottom: 6 }}>
              Parents
            </div>
            {parents.length ? (
              <div className="hstack" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
                {parents.map((p) => (
                  <div key={p} className="person" style={{ minWidth: 150 }}>
                    <Link to={fiche(p)} style={{ alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{name(p)}</span>
                      <span className="small muted">{meta(p) || ' '}</span>
                    </Link>
                    {centerBtn(p)}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ alignSelf: 'center', padding: '10px 16px', borderRadius: 14, border: '2px dashed var(--line)', fontSize: 13 }} className="muted">
                Aucun parent connu
              </div>
            )}
            <div className="vline" />

            <div className="stack" style={{ alignItems: 'center' }}>
              <Link to={fiche(focusId)} className="focus">
                <b>{name(focusId)}</b>
                <span className="small" style={{ opacity: 0.8 }}>
                  {meta(focusId) || ' '}
                </span>
                <span className="small hstack" style={{ fontWeight: 600, gap: 2, marginTop: 4 }}>
                  Voir la fiche <Icon name="next" size={14} stroke={2.5} />
                </span>
              </Link>
              {spouses.map((s) => (
                <span key={s} className="stack" style={{ alignItems: 'center' }}>
                  <span style={{ width: 2, height: 10, background: 'var(--line)' }} />
                  <div className="person" style={{ minWidth: 170 }}>
                    <Link to={fiche(s)} style={{ justifyContent: 'center' }}>
                      <span className="small muted" style={{ fontSize: 11 }}>
                        ⚭ conjoint
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{name(s)}</span>
                    </Link>
                    {g.familyOf.get(s) && centerBtn(s, 16)}
                  </div>
                </span>
              ))}
            </div>

            <div className="stack gap6" style={{ marginTop: 16 }}>
              <div className="eyebrow" style={{ fontSize: 11 }}>
                Frères et sœurs · {sibs.length}
              </div>
              <div className="chips" style={{ gap: 6 }}>
                {sibs.map((s) => (
                  <div key={s} className="person" style={{ flex: 'none', height: 42, borderRadius: 21 }}>
                    <Link to={fiche(s)} style={{ justifyContent: 'center', padding: '0 12px 0 14px', fontSize: 14, fontWeight: 500 }}>
                      {name(s)}
                    </Link>
                    <button className="center" style={{ width: 40 }} onClick={() => go(s)} aria-label={`Centrer l’arbre sur ${name(s)}`}>
                      <Icon name="tree" size={16} />
                    </button>
                  </div>
                ))}
                {!sibs.length && <span className="small muted">Aucun connu</span>}
              </div>
            </div>

            {kids.length > 0 && <div className="vline" style={{ marginTop: 14 }} />}
            <div className="eyebrow" style={{ textAlign: 'center', fontSize: 11, margin: '8px 0 6px' }}>
              Enfants · {kids.length}
            </div>
            {kids.length ? (
              <div className="kids">
                {kids.map((k) => {
                  const n = g.children(k).length
                  return (
                    <div key={k} className="kid">
                      <Link to={fiche(k)}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{name(k)}</span>
                        <span className="small muted" style={{ fontSize: 12 }}>
                          {meta(k) || ' '}
                        </span>
                      </Link>
                      {n ? (
                        <button className="more" onClick={() => go(k)}>
                          <Icon name="down" size={14} /> {n > 1 ? `Ses ${n} enfants` : 'Son enfant'}
                        </button>
                      ) : (
                        <span className="none">Pas d’enfant connu</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="small muted" style={{ alignSelf: 'center' }}>
                Aucun enfant connu
              </div>
            )}

            <div className="hstack wrap small muted" style={{ justifyContent: 'center', gap: 16, marginTop: 22 }}>
              <span>Nom → ouvre la fiche</span>
              <span className="hstack" style={{ gap: 4 }}>
                <Icon name="tree" size={14} /> → recentre l’arbre
              </span>
            </div>
          </div>
        </>
      ) : (
        layout && (
          <>
            <p className="small muted">Fais glisser pour parcourir. Touche un nom pour ouvrir sa fiche.</p>
            <div className="overview" ref={overview}>
              <div style={{ position: 'relative', width: layout.width + 20, height: layout.height }}>
                {layout.lines.map((l, i) => (
                  <span key={i} style={{ position: 'absolute', left: l.x + 20, top: l.y, width: l.w, height: l.h, background: 'var(--line)' }} />
                ))}
                {layout.nodes.map((n) => (
                  <Link key={n.id} to={fiche(n.id)} className={`node ${n.id === focusId ? 'sel' : chainSet.has(n.id) ? 'anc' : ''}`} style={{ left: n.x + 20, top: n.y, width: W, height: H }}>
                    <span style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>{first(n.id)}</span>
                    <small>{n.partner ? `⚭ ${first(n.partner)}` : meta(n.id) || ' '}</small>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )
      )}
    </main>
  )
}
