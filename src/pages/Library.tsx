import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { progress, type Book } from '../../shared/model'
import { api } from '../api'
import { Cover, ErrorBox } from '../components/ui'
import { Icon } from '../components/Icon'
import BookForm from './BookForm'
import { useAuth } from '../Auth'

const pct = (b: Book) => progress(b).pct

export default function Library() {
  const [books, setBooks] = useState<Book[] | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const { user, logout } = useAuth()

  const load = useCallback(() => {
    api.books().then(
      (b) => (setBooks(b), setError('')),
      (e) => setError(e.message)
    )
  }, [])
  useEffect(load, [load])

  const reading = (books || []).filter((b) => !b.finished)
  const done = (books || []).filter((b) => b.finished)

  return (
    <main className="screen">
      <div className="eyebrow" style={{ marginTop: 10 }}>
        Mais c'est qui ?
      </div>
      <h1 className="display" style={{ fontSize: 34, marginBottom: 18 }}>
        Ta bibliothèque
      </h1>

      {error && <ErrorBox error={error} retry={load} />}
      {!books && !error && <p className="muted">Chargement…</p>}

      <div className="stack gap14">
        {reading.length > 0 && <div className="eyebrow">En cours</div>}
        {reading.map((b) => (
          <section key={b.id} className="reading">
            <div className="hstack" style={{ alignItems: 'stretch', gap: 16 }}>
              <Cover book={b} to={`/livre/${b.id}`} />
              <div className="stack gap6" style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/livre/${b.id}`} style={{ textDecoration: 'none', fontFamily: 'var(--display)', fontSize: 23, fontWeight: 800, lineHeight: 1.1 }}>
                  {b.title}
                </Link>
                <div className="muted small">{b.author}</div>
                <div className="hstack wrap" style={{ gap: 6 }}>
                  <span className="badge" style={{ background: 'var(--chip)' }}>
                    {b.entity_count} fiches
                  </span>
                  <span className="badge" style={{ background: 'var(--chip)' }}>
                    {b.relation_count} liens
                  </span>
                </div>
                <div className="stack gap6" style={{ marginTop: 'auto' }}>
                  <div className="progress">
                    <i style={{ width: pct(b) + '%' }} />
                  </div>
                  <div className="mono small muted">{progress(b).label}{pct(b) ? ` · ${pct(b)} %` : ''}</div>
                </div>
              </div>
            </div>
            <Link to={`/livre/${b.id}/page`} className="btn primary">
              <Icon name="bookmark" />
              Je suis à la page…
            </Link>
          </section>
        ))}

        <button className="addbook mt8" onClick={() => setAdding(true)}>
          <span className="iconbtn" style={{ width: 48, height: 48, borderRadius: 14, border: 0 }}>
            <Icon name="plus" size={22} />
          </span>
          <span className="stack">
            <span style={{ fontWeight: 600 }}>Ajouter un livre</span>
            <span className="muted small">Tape le titre : couverture et nombre de pages sont retrouvés tout seuls.</span>
          </span>
        </button>

        {done.length > 0 && (
          <>
            <div className="eyebrow mt14">Terminés</div>
            <div className="hstack wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
              {done.map((b) => (
                <div key={b.id} className="stack gap6" style={{ width: 64 }}>
                  <Cover book={b} small to={`/livre/${b.id}`} />
                  <span className="small" style={{ lineHeight: 1.2 }}>
                    {b.title}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <p className="small muted" style={{ textAlign: 'center', marginTop: 40 }}>
        Connecté en tant que {user.label} ·{' '}
        <button className="back small" style={{ display: 'inline', height: 'auto', padding: 0, color: 'var(--acc)', textDecoration: 'underline' }} onClick={logout}>
          Se déconnecter
        </button>
      </p>

      {adding && <BookForm onClose={() => setAdding(false)} onSaved={load} />}
    </main>
  )
}
