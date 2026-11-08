import { useState } from 'react'
import type { Book } from '../../shared/model'
import { api } from '../api'
import { Sheet, useToast } from '../components/ui'
import { Icon } from '../components/Icon'
import { readEpub, type EpubChapter } from '../lib/epub'

// Import de l'ebook : on découpe en chapitres, le lecteur écarte sommaire et mentions légales, puis on envoie le texte
export default function EpubImport({ book, onClose, onDone }: { book: Book; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [chapters, setChapters] = useState<EpubChapter[] | null>(null)
  const [keep, setKeep] = useState<boolean[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const open = async (f: File) => {
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    setBusy(isPdf ? 'Lecture du PDF…' : 'Lecture de l’ebook…')
    try {
      const parsed = isPdf ? await (await import('../lib/pdf')).readPdf(f, (p) => setBusy(`Lecture du PDF… ${p} %`)) : await readEpub(f)
      setChapters(parsed.chapters)
      setKeep(parsed.chapters.map((c) => !c.extra))
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const send = async () => {
    if (!chapters) return
    const chosen = chapters.filter((_, i) => keep[i]).map((c) => ({ title: c.title, text: c.text }))
    if (!chosen.length) return toast('Garde au moins un chapitre.')
    setBusy('Enregistrement des chapitres…')
    try {
      await api.importEpub(book.id, chosen)
      toast(`${chosen.length} chapitres importés`)
      onDone()
    } catch (e) {
      toast((e as Error).message)
      setBusy(null)
    }
  }

  const count = keep.filter(Boolean).length

  return (
    <Sheet title="Importer le livre (EPUB ou PDF)" onClose={onClose}>
      {!chapters ? (
        <div className="stack gap14">
          <p className="small" style={{ margin: 0, color: 'var(--soft)' }}>
            Avec le fichier de ton livre (EPUB ou PDF), l’IA lit vraiment chaque chapitre : les fiches sont fiables, même pour un livre peu connu, et jamais en avance sur ta lecture.
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            Les ebooks protégés (DRM) et les PDF scannés sans texte ne peuvent pas être lus. Le texte reste dans ta base privée.
          </p>
          <label className="btn primary" style={{ cursor: busy ? 'default' : 'pointer' }}>
            <Icon name="download" />
            {busy || 'Choisir le fichier (EPUB ou PDF)'}
            <input type="file" accept=".epub,.pdf,application/epub+zip,application/pdf" className="sr" disabled={!!busy} onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
          </label>
        </div>
      ) : (
        <div className="stack gap10">
          <p className="small" style={{ margin: 0, color: 'var(--soft)' }}>
            Décoche ce qui n’est pas un chapitre de l’histoire (sommaire, remerciements…). La numérotation des chapitres suit cette liste.
          </p>
          <div className="list" style={{ maxHeight: '50dvh', overflowY: 'auto' }}>
            {chapters.map((c, i) => {
              const n = keep.slice(0, i + 1).filter(Boolean).length
              return (
                <label key={i} className="row" style={{ cursor: 'pointer', minHeight: 52 }}>
                  <input type="checkbox" checked={keep[i]} onChange={(e) => setKeep(keep.map((k, j) => (j === i ? e.target.checked : k)))} style={{ width: 20, height: 20, accentColor: 'var(--acc)' }} />
                  <span className="grow">
                    <span className="title" style={{ fontSize: 14 }}>
                      {keep[i] ? `${n}. ` : ''}
                      {c.title}
                    </span>
                    <span className="sub">{c.words.toLocaleString('fr-FR')} mots</span>
                  </span>
                </label>
              )
            })}
          </div>
          <button className="btn primary" onClick={send} disabled={!!busy}>
            {busy || `Importer ${count} chapitre${count > 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </Sheet>
  )
}
