import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { displayName, initials, type Book, type Entity } from '../../shared/model'
import { coverUrl } from '../api'
import { Icon } from './Icon'

export function Avatar({ e, size = '' }: { e: Pick<Entity, 'kind' | 'name' | 'data'>; size?: '' | 'sm' | 'lg' }) {
  return (
    <span className={`avatar k-${e.kind} ${e.kind === 'character' ? '' : 'sq'} ${size}`} aria-hidden="true">
      {initials(e)}
    </span>
  )
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="back">
      <Icon name="back" />
      {label}
    </Link>
  )
}

const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export function Cover({ book, small = false, to }: { book: Book; small?: boolean; to?: string }) {
  const url = coverUrl(book)
  const h = hue(book.title)
  const style = url ? { backgroundImage: `url(${url})` } : { background: `linear-gradient(160deg, hsl(${h} 30% 30%), hsl(${h} 35% 16%))` }
  const inner = url ? null : (
    <>
      <span className="t">{book.title}</span>
      <span className="a">{book.author}</span>
    </>
  )
  return to ? (
    <Link to={to} className={`cover ${small ? 'sm' : ''}`} style={style} aria-label={`Ouvrir ${book.title}`}>
      {inner}
    </Link>
  ) : (
    <div className={`cover ${small ? 'sm' : ''}`} style={style}>
      {inner}
    </div>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(ev) => ev.stopPropagation()}>
        <div className="hstack between">
          <h2>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Fermer" style={{ marginTop: -14 }}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Petits messages éphémères (« Enregistré », erreurs…)
const ToastCtx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3200)
    return () => clearTimeout(t)
  }, [msg])
  const show = useCallback((m: string) => setMsg(m), [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export function EntityRow({ e, to, sub }: { e: Entity; to: string; sub?: string }) {
  return (
    <Link to={to} className="row">
      <Avatar e={e} />
      <span className="grow">
        <span className="title">{displayName(e)}</span>
        {sub !== '' && <span className="sub">{sub ?? summary(e)}</span>}
      </span>
      {!!e.to_clarify && (
        <span aria-label="À clarifier" style={{ color: 'var(--warn)', display: 'flex' }}>
          <Icon name="flag" size={18} />
        </span>
      )}
    </Link>
  )
}

export const summary = (e: Entity) => {
  const d = e.data
  const parts =
    e.kind === 'character'
      ? [d.alias && `« ${d.alias} »`, d.job, d.age && `${d.age} ans`]
      : e.kind === 'place'
        ? [d.usage, d.city]
        : e.kind === 'org'
          ? [d.type, d.sector]
          : [d.date]
  return parts.filter(Boolean).join(' · ') || (e.notes ? e.notes.split('\n')[0] : '')
}

export function Loading() {
  return (
    <div className="screen">
      <p className="muted">Chargement…</p>
    </div>
  )
}

export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="banner error" role="alert">
      <span style={{ flex: 1 }}>{error}</span>
      {retry && (
        <button className="btn sm" onClick={retry}>
          Réessayer
        </button>
      )}
    </div>
  )
}
