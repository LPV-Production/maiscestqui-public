import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { displayName, KINDS, KIND_ORDER, norm, progress, type Entity, type Kind } from '../../shared/model'
import { useBook } from '../BookContext'
import { Avatar, BackLink, EntityRow, summary } from '../components/ui'
import { Icon } from '../components/Icon'
import BookForm from './BookForm'
import EntityForm from './EntityForm'
import EpubImport from './EpubImport'

// Clé de tri des dates écrites librement (22/09/1966, 1966, juin 19**…)
const dateKey = (s = '') => {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) return `${m[3].padStart(4, '19')}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const y = s.match(/\d{4}/)
  return y ? `${y[0]}-00-00` : `9999-${s}`
}
const sortKey = (e: Entity) => (e.kind === 'event' ? dateKey(e.data.date) : norm(e.kind === 'character' ? `${e.name} ${e.data.first || ''}` : e.name))

export default function Notebook() {
  const { book, entities, chapters, reload } = useBook()
  const navigate = useNavigate()
  const [kind, setKind] = useState<Kind>('character')
  const [q, setQ] = useState('')
  const [onlyClarify, setOnlyClarify] = useState(false)
  const [editBook, setEditBook] = useState(false)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const base = `/livre/${book.id}`

  const counts = useMemo(() => Object.fromEntries(KIND_ORDER.map((k) => [k, entities.filter((e) => e.kind === k).length])), [entities])
  const clarify = entities.filter((e) => e.to_clarify)
  const recent = useMemo(() => [...entities].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8), [entities])
  const query = norm(q)

  const list = useMemo(() => {
    let l: Entity[]
    if (query) l = entities.filter((e) => norm([displayName(e), e.data.alias, e.data.job, e.data.usage, e.notes].filter(Boolean).join(' ')).includes(query))
    else if (onlyClarify) l = clarify
    else l = entities.filter((e) => e.kind === kind)
    return [...l].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  }, [entities, query, onlyClarify, kind, clarify])

  const { pct, label: progressLabel } = progress(book)
  const listTitle = query ? `Résultats · ${list.length}` : onlyClarify ? 'À clarifier' : `${KINDS[kind].label} · A → Z`

  return (
    <main className="screen">
      <div className="topbar">
        <BackLink to="/" label="Bibliothèque" />
        <div className="right">
          <Link to={`${base}/liens`} className="iconbtn" aria-label="Carte des liens">
            <Icon name="graph" />
          </Link>
          <Link to={`${base}/arbre`} className="iconbtn" aria-label="Arbres familiaux">
            <Icon name="tree" />
          </Link>
          <button className="iconbtn" aria-label="Modifier le livre" onClick={() => setEditBook(true)}>
            <Icon name="more" />
          </button>
        </div>
      </div>

      <h1 className="display">{book.title}</h1>
      <div className="hstack" style={{ marginTop: 8 }}>
        <div className="progress" style={{ flex: 1, height: 4 }}>
          <i style={{ width: pct + '%' }} />
        </div>
        <span className="mono small muted">{progressLabel}</span>
      </div>

      <div className="search mt14">
        <Icon name="search" />
        <label htmlFor="nb-q" className="sr">
          Rechercher dans le carnet
        </label>
        <input id="nb-q" type="search" placeholder="C'est qui déjà ?" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!query && (
        <div className="tiles mt14">
          {KIND_ORDER.map((k) => (
            <button key={k} className="tile" aria-pressed={k === kind && !onlyClarify} onClick={() => (setKind(k), setOnlyClarify(false))}>
              <b>{counts[k]}</b>
              <span>{KINDS[k].short}</span>
            </button>
          ))}
        </div>
      )}

      <div className="stack gap22" style={{ marginTop: 20 }}>
        {!query && !onlyClarify && recent.length > 0 && (
          <section className="stack gap10">
            <h2 className="section">Ajoutés récemment</h2>
            <div className="chips" style={{ gap: 10 }}>
              {recent.map((e) => (
                <Link key={e.id} to={`${base}/fiche/${e.id}`} className="card" style={{ flex: 'none', width: 140, padding: '14px 12px', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Avatar e={e} />
                  <span className="stack">
                    <span style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.25 }}>{displayName(e)}</span>
                    <span className="small muted" style={{ lineHeight: 1.3, fontSize: 12 }}>
                      {summary(e) || KINDS[e.kind].one}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!query && !chapters.length && entities.length < 10 && (
          <button className="banner" onClick={() => setImporting(true)} style={{ border: '1px dashed var(--line)', cursor: 'pointer', textAlign: 'left', width: '100%', alignItems: 'center' }}>
            <span style={{ color: 'var(--acc)', display: 'flex' }}>
              <Icon name="download" size={20} />
            </span>
            <span style={{ flex: 1 }}>
              <b style={{ color: 'var(--ink)' }}>Tu as l’ebook de ce livre ?</b>
              <br />
              Importe le fichier EPUB ou PDF : l’IA lira chaque chapitre pour remplir tes fiches.
            </span>
            <Icon name="next" size={18} />
          </button>
        )}

        {!query && clarify.length > 0 && (
          <button className="banner warn" onClick={() => setOnlyClarify(!onlyClarify)} aria-pressed={onlyClarify}>
            <Icon name="flag" size={18} />
            <span style={{ flex: 1 }}>{onlyClarify ? 'Revenir à toutes les fiches' : `${clarify.length} fiche${clarify.length > 1 ? 's' : ''} à clarifier`}</span>
            <Icon name={onlyClarify ? 'close' : 'next'} size={18} />
          </button>
        )}

        <section className="stack gap10">
          <h2 className="section">{listTitle}</h2>
          {list.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              {query ? 'Aucune fiche ne correspond.' : 'Rien ici pour l’instant. Indique ta page pour que l’app te propose des fiches, ou ajoute-en une avec +.'}
            </p>
          ) : (
            <div className="list">
              {list.map((e) => (
                <EntityRow key={e.id} e={e} to={`${base}/fiche/${e.id}`} sub={query || onlyClarify ? [KINDS[e.kind].one, summary(e)].filter(Boolean).join(' · ') : undefined} />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="dock">
        <div className="inner">
          <Link to={`${base}/page`} className="btn primary">
            <Icon name="bookmark" />
            Je suis à la page…
          </Link>
          <button className="btn square" aria-label="Ajouter une fiche à la main" onClick={() => setAdding(true)}>
            <Icon name="plus" size={22} />
          </button>
        </div>
      </div>

      {editBook && <BookForm book={book} chapterCount={chapters.length} onImportEpub={() => (setEditBook(false), setImporting(true))} onClose={() => setEditBook(false)} onSaved={reload} onDeleted={() => navigate('/')} />}
      {importing && (
        <EpubImport
          book={book}
          onClose={() => setImporting(false)}
          onDone={async () => {
            setImporting(false)
            await reload()
          }}
        />
      )}
      {adding && (
        <EntityForm
          bookId={book.id}
          kind={kind}
          unit={book.unit}
          defaultPage={(book.unit === 'chapter' ? book.current_chapter : book.current_page) || undefined}
          onClose={() => setAdding(false)}
          onSaved={async (e) => {
            setAdding(false)
            await reload()
            navigate(`${base}/fiche/${e.id}`)
          }}
        />
      )}
    </main>
  )
}
