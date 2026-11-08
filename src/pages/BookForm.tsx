import { useEffect, useState } from 'react'
import type { Book } from '../../shared/model'
import { api, coverUrl, type Lookup } from '../api'
import { Sheet, useToast } from '../components/ui'
import { Icon } from '../components/Icon'
import { toJpegDataUrl } from '../lib/image'

// Ajout d'un livre en deux temps : on retrouve l'édition exacte (BnF, Open Library), puis on complète.
export default function BookForm({ book, chapterCount = 0, onImportEpub, onClose, onSaved, onDeleted }: {
  book?: Book
  chapterCount?: number
  onImportEpub?: () => void
  onClose: () => void
  onSaved: (b: Book) => void
  onDeleted?: () => void
}) {
  const toast = useToast()
  const [step, setStep] = useState<'search' | 'details'>(book ? 'details' : 'search')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Lookup[] | null>(null)
  const [searching, setSearching] = useState(false)

  const [title, setTitle] = useState(book?.title || '')
  const [author, setAuthor] = useState(book?.author || '')
  const [pages, setPages] = useState(book?.total_pages ? String(book.total_pages) : '')
  const [edition, setEdition] = useState({ isbn: book?.isbn || '', publisher: book?.publisher || '', year: book?.year || '' })
  // undefined = inchangée, null = retirée, string = nouvelle image
  const [cover, setCover] = useState<string | null | undefined>(undefined)
  const [finished, setFinished] = useState(!!book?.finished)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (step !== 'search' || q.trim().length < 2) return setFound(null)
    setSearching(true)
    const t = setTimeout(() => {
      api
        .lookup(q)
        .then(setFound, () => setFound([]))
        .finally(() => setSearching(false))
    }, 600)
    return () => clearTimeout(t)
  }, [q, step])

  const pick = async (l: Lookup) => {
    setTitle(l.title)
    setAuthor(l.author)
    setPages(l.pages ? String(l.pages) : '')
    setEdition({ isbn: l.isbn, publisher: l.publisher, year: l.year })
    setStep('details')
    if (l.coverId) {
      try {
        setCover(await toJpegDataUrl(`/api/lookup/cover/${l.coverId}`))
      } catch {
        /* pas de couverture : tant pis */
      }
    }
  }

  const manual = () => {
    setTitle(q.trim())
    setStep('details')
  }

  const save = async () => {
    if (!title.trim()) return toast('Le titre est obligatoire.')
    setBusy(true)
    try {
      const payload = { title, author, total_pages: pages ? Number(pages) : null, ...edition }
      const saved = book
        ? await api.updateBook(book.id, { ...payload, finished: finished ? 1 : 0, ...(cover !== undefined ? { cover } : {}) })
        : await api.addBook({ ...payload, cover: cover || null })
      onSaved(saved)
      onClose()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!book || !confirm(`Supprimer « ${book.title} » et toutes ses fiches ? C'est définitif.`)) return
    try {
      await api.deleteBook(book.id)
      onDeleted?.()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const preview = cover === undefined ? (book ? coverUrl(book) : null) : cover

  if (step === 'search')
    return (
      <Sheet title="Ajouter un livre" onClose={onClose}>
        <div className="field">
          <label htmlFor="bf-q">Titre et auteur</label>
          <input id="bf-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex. W3 Camut" />
        </div>
        {searching && <p className="small muted">Recherche des éditions…</p>}
        {found && !searching && (
          <>
            <div className="eyebrow" style={{ margin: '4px 0 8px' }}>
              {found.length ? 'Choisis ton édition' : 'Aucune édition trouvée'}
            </div>
            {found.length > 0 && (
              <div className="list" style={{ marginBottom: 12 }}>
                {found.map((l, i) => (
                  <button key={i} className="row" onClick={() => pick(l)}>
                    <span className="grow">
                      <span className="title">{l.title}</span>
                      <span className="sub">{l.author}</span>
                      <span className="sub" style={{ color: 'var(--soft)' }}>
                        {[l.publisher, l.year, l.pages && `${l.pages} pages`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Icon name="next" size={18} />
                  </button>
                ))}
              </div>
            )}
            <p className="small muted">
              Prends l’édition qui a le même nombre de pages que ton livre (regarde la dernière page).{' '}
              <button className="back small" style={{ display: 'inline', height: 'auto', padding: 0, color: 'var(--acc)', textDecoration: 'underline' }} onClick={manual}>
                Je ne la trouve pas, saisir à la main
              </button>
            </p>
          </>
        )}
      </Sheet>
    )

  return (
    <Sheet title={book ? 'Modifier le livre' : 'Ton édition'} onClose={onClose}>
      <div className="hstack" style={{ alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
        <label style={{ cursor: 'pointer', flex: 'none' }} aria-label="Photographier la couverture">
          {preview ? (
            <img src={preview} alt="" style={{ width: 72, height: 108, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
          ) : (
            <span className="stack" style={{ width: 72, height: 108, borderRadius: 6, border: '2px dashed var(--line)', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--mute)', fontSize: 11, textAlign: 'center' }}>
              <Icon name="camera" />
              Couverture
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setCover(await toJpegDataUrl(f))
            }}
          />
        </label>
        <div className="stack gap6" style={{ minWidth: 0 }}>
          <b style={{ fontFamily: 'var(--display)', fontSize: 19, lineHeight: 1.15 }}>{title || 'Nouveau livre'}</b>
          <span className="small muted">{[edition.publisher, edition.year, edition.isbn && `ISBN ${edition.isbn}`].filter(Boolean).join(' · ')}</span>
          {preview ? (
            <button className="back small" style={{ height: 28, padding: 0, color: 'var(--soft)' }} onClick={() => setCover(null)}>
              Retirer la couverture
            </button>
          ) : (
            <span className="small muted">Touche le cadre pour photographier ta couverture.</span>
          )}
        </div>
      </div>
      <div className="field">
        <label htmlFor="bf-title">Titre</label>
        <input id="bf-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="bf-author">Auteur</label>
        <input id="bf-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="bf-pages">Nombre de pages de ton édition</label>
        <input id="bf-pages" type="number" inputMode="numeric" min="1" value={pages} onChange={(e) => setPages(e.target.value)} />
      </div>
      {book && (
        <div className="card hstack" style={{ marginBottom: 12, gap: 12 }}>
          <Icon name="download" />
          <span style={{ flex: 1 }} className="small">
            {chapterCount ? <><b>Ebook importé</b> · {chapterCount} chapitres</> : <><b>Pas d’ebook</b> · importe l’EPUB ou le PDF pour des fiches fiables</>}
          </span>
          <button className="btn sm" onClick={onImportEpub}>
            {chapterCount ? 'Remplacer' : 'Importer'}
          </button>
          {chapterCount > 0 && (
            <button
              className="btn sm danger"
              onClick={async () => {
                if (!confirm('Retirer le texte de l’ebook ? Tes fiches sont conservées.')) return
                await api.deleteEpub(book.id)
                onSaved(book)
                onClose()
              }}
            >
              Retirer
            </button>
          )}
        </div>
      )}
      {book && (
        <label className="check">
          <input type="checkbox" checked={finished} onChange={(e) => setFinished(e.target.checked)} />
          J'ai fini ce livre
        </label>
      )}
      <button className="btn primary block mt14" onClick={save} disabled={busy}>
        {busy ? 'Enregistrement…' : book ? 'Enregistrer' : 'Ajouter à ma bibliothèque'}
      </button>
      {!book && (
        <div className="hstack mt14" style={{ justifyContent: 'center' }}>
          <button className="btn sm" onClick={() => setStep('search')}>
            Choisir une autre édition
          </button>
        </div>
      )}
      {book && (
        <div className="hstack mt14" style={{ justifyContent: 'center' }}>
          <a className="btn sm" href={`/api/books/${book.id}/export`} download={`${book.title}.json`}>
            Exporter
          </a>
          <button className="btn sm danger" onClick={remove}>
            Supprimer le livre
          </button>
        </div>
      )}
    </Sheet>
  )
}
