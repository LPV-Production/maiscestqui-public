import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { displayName, KINDS, KIND_ORDER, type Entity, type Relation } from '../../shared/model'
import { useBook } from '../BookContext'
import { BackLink } from '../components/ui'

type Pos = Record<string, { x: number; y: number }>

// Disposition « ressorts » : les fiches liées s'attirent, les autres se repoussent
function layout(ents: Entity[], rels: Relation[]): Pos {
  const ids = ents.map((e) => e.id)
  const p: Record<string, { x: number; y: number; vx: number; vy: number }> = {}
  ents.forEach((e, i) => {
    const a = 2 * Math.PI * (KIND_ORDER.indexOf(e.kind) / 4 + (i % 7) / 40)
    const r = 150 + (i % 5) * 40
    p[e.id] = { x: r * Math.cos(a), y: r * Math.sin(a), vx: 0, vy: 0 }
  })
  const links = rels.filter((r) => p[r.from_id] && p[r.to_id])
  for (let it = 0; it < 300; it++) {
    const t = 1 - it / 300
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = p[ids[i]], b = p[ids[j]]
        const dx = a.x - b.x, dy = a.y - b.y
        const d2 = dx * dx + dy * dy || 1
        const d = Math.sqrt(d2), f = 9000 / d2
        a.vx += (dx / d) * f, a.vy += (dy / d) * f, b.vx -= (dx / d) * f, b.vy -= (dy / d) * f
      }
    for (const l of links) {
      const a = p[l.from_id], b = p[l.to_id]
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 130) * 0.02
      a.vx += (dx / d) * f, a.vy += (dy / d) * f, b.vx -= (dx / d) * f, b.vy -= (dy / d) * f
    }
    for (const id of ids) {
      const n = p[id]
      n.vx -= n.x * 0.01, n.vy -= n.y * 0.01
      n.x += Math.max(-20, Math.min(20, n.vx)) * t
      n.y += Math.max(-20, Math.min(20, n.vy)) * t
      n.vx *= 0.5, n.vy *= 0.5
    }
  }
  return p
}

export default function Links() {
  const { book, entities, relations, byId } = useBook()
  const base = `/livre/${book.id}`
  // La disposition ne dépend que de la structure : elle ne bouge pas quand on modifie une note
  const shape = entities.map((e) => e.id).join() + '|' + relations.map((r) => r.id).join()
  const pos = useMemo(() => layout(entities, relations), [shape])
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [sel, setSel] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const moved = useRef(0)

  const zoomAt = (cx: number, cy: number, f: number) => {
    const r = box.current!.getBoundingClientRect()
    const x = cx - r.left, y = cy - r.top
    setView((v) => {
      const k = Math.max(0.15, Math.min(6, v.k * f)), s = k / v.k
      return { k, x: x - (x - v.x) * s, y: y - (y - v.y) * s }
    })
  }
  const fit = useCallback(() => {
    const el = box.current
    const pts = Object.values(pos)
    if (!el || !pts.length) return
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const x0 = Math.min(...xs) - 90, x1 = Math.max(...xs) + 90, y0 = Math.min(...ys) - 60, y1 = Math.max(...ys) + 60
    const k = Math.min(el.clientWidth / (x1 - x0), el.clientHeight / (y1 - y0), 2)
    setView({ k, x: el.clientWidth / 2 - (k * (x0 + x1)) / 2, y: el.clientHeight / 2 - (k * (y0 + y1)) / 2 })
  }, [pos])
  useEffect(fit, [fit])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => (e.preventDefault(), zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15))
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const down = (e: React.PointerEvent) => (pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }), (moved.current = 0))
  const move = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p)
    if (!others.length) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y
      moved.current += Math.hypot(dx, dy)
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
    } else {
      const o = others[0]
      const now = Math.hypot(e.clientX - o.x, e.clientY - o.y), before = Math.hypot(prev.x - o.x, prev.y - o.y) || 1
      moved.current += 10
      zoomAt((e.clientX + o.x) / 2, (e.clientY + o.y) / 2, now / before)
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const up = (e: React.PointerEvent) => pointers.current.delete(e.pointerId)
  const tap = (fn: () => void) => () => moved.current < 6 && fn()

  const touches = (r: Relation) => !!sel && (r.from_id === sel || r.to_id === sel)
  const near = new Set(sel ? [sel, ...relations.filter(touches).flatMap((r) => [r.from_id, r.to_id])] : [])
  const s = 1 / Math.sqrt(view.k)
  const font = 13 * s
  const selected = sel ? byId.get(sel) : undefined

  return (
    <main className="screen">
      <div className="topbar">
        <BackLink to={base} label="Carnet" />
        <div className="right">
          <button className="iconbtn" onClick={() => zoomAt(box.current!.getBoundingClientRect().left + box.current!.clientWidth / 2, box.current!.getBoundingClientRect().top + box.current!.clientHeight / 2, 1.4)} aria-label="Zoomer">
            +
          </button>
          <button className="iconbtn" onClick={() => zoomAt(box.current!.getBoundingClientRect().left + box.current!.clientWidth / 2, box.current!.getBoundingClientRect().top + box.current!.clientHeight / 2, 1 / 1.4)} aria-label="Dézoomer">
            −
          </button>
          <button className="btn sm" onClick={fit}>
            Tout voir
          </button>
        </div>
      </div>
      <h1 className="display" style={{ fontSize: 28 }}>
        Carte des liens
      </h1>
      <div className="hstack wrap small muted" style={{ gap: 14, margin: '8px 0 10px' }}>
        {KIND_ORDER.map((k) => (
          <span key={k} className="hstack" style={{ gap: 6 }}>
            <span className={`dot k-${k}`} />
            {KINDS[k].label}
          </span>
        ))}
      </div>

      {entities.length === 0 ? (
        <p className="muted">Rien à afficher pour l’instant.</p>
      ) : (
        <div className="mapbox" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
          <svg width="100%" height="100%" style={{ display: 'block', touchAction: 'none' }}>
            <rect width="100%" height="100%" fill="transparent" onClick={tap(() => setSel(null))} />
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {relations.map((r) =>
                pos[r.from_id] && pos[r.to_id] ? (
                  <line key={r.id} x1={pos[r.from_id].x} y1={pos[r.from_id].y} x2={pos[r.to_id].x} y2={pos[r.to_id].y} stroke={touches(r) ? 'var(--acc)' : 'var(--faint)'} strokeOpacity={sel ? (touches(r) ? 1 : 0.08) : 0.5} strokeWidth={(touches(r) ? 3 : 1.5) * s} />
                ) : null
              )}
              {entities.map((e) => (
                <g key={e.id} onClick={tap(() => setSel(e.id === sel ? null : e.id))} style={{ cursor: 'pointer', opacity: !sel || near.has(e.id) ? 1 : 0.15 }}>
                  <circle cx={pos[e.id].x} cy={pos[e.id].y} r={11 * s} fill={`var(--k-${e.kind})`} stroke={e.id === sel ? 'var(--ink)' : 'none'} strokeWidth={3 * s} />
                  <text x={pos[e.id].x} y={pos[e.id].y + 26 * s} textAnchor="middle" fontSize={font} fill="var(--ink)" stroke="var(--card)" strokeWidth={3 * s} paintOrder="stroke">
                    {displayName(e)}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      )}

      {selected ? (
        <div className="card mt14 stack gap6">
          <div className="hstack between">
            <b style={{ fontFamily: 'var(--display)', fontSize: 19 }}>{displayName(selected)}</b>
            <Link to={`${base}/fiche/${selected.id}`} className="btn sm">
              Ouvrir la fiche
            </Link>
          </div>
          {relations.filter(touches).map((r) => {
            const meFrom = r.from_id === selected.id
            const o = byId.get(meFrom ? r.to_id : r.from_id)
            if (!o) return null
            return (
              <div key={r.id} className="hstack between small" style={{ borderTop: '1px solid var(--line2)', paddingTop: 6 }}>
                <button className="back" style={{ height: 32, padding: 0, fontWeight: 600 }} onClick={() => setSel(o.id)}>
                  {displayName(o)}
                </button>
                <span className="muted">{[meFrom ? r.to_role : r.from_role, r.label].filter(Boolean).join(' · ') || r.category}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="small muted mt8">Glisse pour te déplacer, pince ou molette pour zoomer. Touche une bulle pour voir ses liens.</p>
      )}
    </main>
  )
}
