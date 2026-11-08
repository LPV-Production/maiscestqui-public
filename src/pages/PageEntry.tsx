import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { PendingRef, SuggestedEntity, SuggestedRelation, SuggestedUpdate, Suggestions, Unit } from '../../shared/model'
import { useBook } from '../BookContext'
import { api } from '../api'
import { useToast } from '../components/ui'
import { Icon } from '../components/Icon'
import { readPhoto } from '../lib/ocr'
import EpubImport from './EpubImport'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

export default function PageEntry() {
  const { book, chapters, reload, setSuggestions, suggestions } = useBook()
  const navigate = useNavigate()
  const toast = useToast()
  const hasEpub = chapters.length > 0
  const [unit, setUnit] = useState<Unit>(hasEpub ? 'chapter' : book.unit)
  const [digits, setDigits] = useState(String((unit === 'chapter' ? book.current_chapter : book.current_page) || ''))
  const [totalCh, setTotalCh] = useState(book.total_chapters ? String(book.total_chapters) : '')
  const [picked, setPicked] = useState(Math.min(chapters.length, Math.max(book.scanned_chapter + 1, book.current_chapter)) || 1)
  const [busy, setBusy] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const base = `/livre/${book.id}`

  const switchUnit = (u: Unit) => {
    setUnit(u)
    setDigits(String((u === 'chapter' ? book.current_chapter : book.current_page) || ''))
  }

  const epubMode = unit === 'chapter' && hasEpub
  const total = unit === 'chapter' ? Number(totalCh) || 0 : book.total_pages || 0
  const n = epubMode ? picked : Math.min(total || 99999, parseInt(digits || '0', 10))
  const last = unit === 'chapter' ? book.scanned_chapter : book.scanned_page
  const fresh = n > last
  const pct = epubMode ? Math.round((n / chapters.length) * 100) : total ? Math.round((n / total) * 100) : null
  const word = unit === 'chapter' ? 'chapitre' : 'page'
  const range = chapters.filter((c) => c.idx > last && c.idx <= n)

  const press = (k: string) => {
    if (k === 'del') setDigits((d) => d.slice(0, -1))
    else if (k && digits.length < 5) setDigits((d) => (d === '0' ? k : d + k))
  }

  const saveProgress = () =>
    api.updateBook(book.id, unit === 'chapter' ? { unit, current_chapter: n, ...(hasEpub ? {} : { total_chapters: Number(totalCh) || null }) } : { unit, current_page: n })

  const done = async (s: Suggestions) => {
    setSuggestions(s)
    await reload()
    navigate(`${base}/nouveautes`)
  }

  // Lit les chapitres de l'EPUB un par un (et par morceaux s'ils sont longs), en cumulant les suggestions
  const readChapters = async () => {
    const entities: SuggestedEntity[] = []
    const updates = new Map<string, SuggestedUpdate>()
    const relations: SuggestedRelation[] = []
    const engines = new Set<string>()
    const from = range[0]?.idx ?? n
    let lastDone = last
    try {
      await saveProgress()
      for (const [i, ch] of range.entries()) {
        let part = 0
        let parts = 1
        do {
          setBusy(`Lecture du chapitre ${ch.idx}${parts > 1 ? ` (partie ${part + 1}/${parts})` : ''} · ${i + 1} sur ${range.length}`)
          const pending: PendingRef[] = entities.map((e) => ({ key: e.key, kind: e.kind, name: e.name, first: e.data.first, alias: e.data.alias }))
          const s = await api.suggest(book.id, { unit: 'chapter', at: ch.idx, useEpub: true, part, pending })
          entities.push(...s.entities)
          for (const u of s.updates) updates.set(u.id, { ...u, facts: { ...updates.get(u.id)?.facts, ...u.facts } })
          relations.push(...s.relations)
          if (s.engine) engines.add(s.engine)
          parts = s.parts || 1
          part++
        } while (part < parts)
        lastDone = ch.idx
      }
    } catch (e) {
      toast((e as Error).message)
      if (lastDone <= last) return setBusy(null)
      toast(`Lecture arrêtée au chapitre ${lastDone}. Tu peux valider ce qui a été trouvé.`)
    }
    await done({ unit: 'chapter', from, to: lastDone, source: 'epub', engine: [...engines].join(', '), entities, updates: [...updates.values()], relations })
  }

  const fromMemoryOrPhoto = async (photo?: File) => {
    if (!n) return toast(`Indique d’abord ton ${word}.`)
    try {
      let ocrText: string | undefined
      if (photo) {
        setBusy('Lecture de la photo…')
        ocrText = await readPhoto(photo, (p) => setBusy(`Lecture de la photo… ${p} %`))
        if (ocrText.length < 40) toast('La photo est difficile à lire : réessaie avec plus de lumière, bien à plat.')
      }
      setBusy(photo ? 'L’IA lit le texte…' : `L’IA cherche les nouveautés du ${word} ${Math.min(last + 1, n)} au ${n}…`)
      await saveProgress()
      await done(await api.suggest(book.id, { unit, at: n, ocrText }))
    } catch (e) {
      toast((e as Error).message)
      setBusy(null)
    }
  }

  const justSave = async () => {
    try {
      await saveProgress()
      await reload()
      toast(`${unit === 'chapter' ? 'Chapitre' : 'Page'} ${n} enregistré${unit === 'page' ? 'e' : ''}`)
      navigate(base)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <main className="screen" style={{ display: 'flex', flexDirection: 'column', paddingBottom: 24 }}>
      <div className="topbar">
        <div className="seg" style={{ marginLeft: 8 }}>
          <button aria-pressed={unit === 'chapter'} onClick={() => switchUnit('chapter')}>
            Chapitre
          </button>
          <button aria-pressed={unit === 'page'} onClick={() => switchUnit('page')}>
            Page
          </button>
        </div>
        <Link to={base} className="iconbtn" aria-label="Fermer">
          <Icon name="close" />
        </Link>
      </div>

      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', marginTop: 10 }}>
        <h1 className="display" style={{ fontSize: 26 }}>
          {epubMode ? 'Quel chapitre viens-tu de finir ?' : 'Tu en es où ?'}
        </h1>
        {!epubMode && (
          <div className="hstack" style={{ alignItems: 'baseline', marginTop: 14 }} aria-live="polite">
            <span className="mono muted">{unit === 'chapter' ? 'ch.' : 'p.'}</span>
            <span className="bignum">{digits || '0'}</span>
            {unit === 'page' && total > 0 && <span className="mono muted">/ {total}</span>}
            {unit === 'chapter' && (
              <label className="mono muted hstack" style={{ gap: 6 }}>
                sur
                <input type="number" inputMode="numeric" min="1" value={totalCh} onChange={(e) => setTotalCh(e.target.value)} aria-label="Nombre total de chapitres" placeholder="?" style={{ width: 64, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--card)', fontFamily: 'var(--mono)', fontSize: 15 }} />
              </label>
            )}
          </div>
        )}
        {pct !== null && !epubMode && (
          <div className="progress" style={{ width: 240, marginTop: 14 }}>
            <i style={{ width: Math.min(100, pct) + '%' }} />
          </div>
        )}
      </div>

      {epubMode ? (
        <div className="list mt14" style={{ maxHeight: '42dvh', overflowY: 'auto' }}>
          {chapters.map((c) => {
            const read = c.idx <= last
            const sel = c.idx === picked
            return (
              <button key={c.idx} className="row" onClick={() => setPicked(c.idx)} aria-pressed={sel} style={{ minHeight: 52, background: sel ? 'var(--chip)' : 'transparent', margin: '0 -14px', padding: '10px 14px', width: 'calc(100% + 28px)' }}>
                <span className="mono small muted" style={{ width: 28 }}>
                  {c.idx}
                </span>
                <span className="grow">
                  <span className="title" style={{ fontSize: 14, fontWeight: sel ? 700 : 500 }}>
                    {c.title}
                  </span>
                </span>
                {read && (
                  <span className="small" style={{ color: 'var(--ok)', display: 'flex' }} aria-label="Déjà lu">
                    <Icon name="check" size={16} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <>
          {unit === 'chapter' && !hasEpub && (
            <button className="banner warn mt14" onClick={() => setImporting(true)} style={{ fontWeight: 500, fontSize: 13 }}>
              <Icon name="download" size={18} />
              <span style={{ flex: 1 }}>Tu as l’ebook (EPUB ou PDF) ? Importe-le : l’IA lira vraiment chaque chapitre.</span>
              <Icon name="next" size={18} />
            </button>
          )}
        </>
      )}

      <div className="banner mt14">
        <span style={{ color: 'var(--ok)', display: 'flex', marginTop: 1 }}>
          <Icon name="shield" size={18} />
        </span>
        <span>
          {!fresh
            ? last
              ? `Tu avais déjà fait le point jusqu’au ${word} ${last}. Choisis plus loin pour trouver des nouveautés.`
              : `Indique le ${word} où tu t’es arrêté.`
            : epubMode
              ? `L’IA va lire ${range.length > 1 ? `les chapitres ${range[0].idx} à ${n}` : `le chapitre ${n}`}, et rien au-delà.`
              : `Sans le texte du livre, l’IA s’appuie sur ce qu’elle en sait : fiable seulement pour les livres très connus. La photo d’une page donne de meilleurs résultats.`}
        </span>
      </div>

      {suggestions && !busy && (
        <Link to={`${base}/nouveautes`} className="banner warn mt8" style={{ textDecoration: 'none' }}>
          <Icon name="sparkle" size={18} />
          <span style={{ flex: 1 }}>Tu as des nouveautés à valider</span>
          <Icon name="next" size={18} />
        </Link>
      )}

      <div style={{ flex: 1, minHeight: 16 }} />

      {busy ? (
        <div className="card stack gap10" style={{ alignItems: 'center', textAlign: 'center', padding: 24 }} role="status">
          <span style={{ color: 'var(--acc)' }}>
            <Icon name="sparkle" size={28} />
          </span>
          <b>{busy}</b>
          <span className="muted small">Quelques secondes par chapitre. Garde l’app ouverte.</span>
        </div>
      ) : (
        <>
          {!epubMode && (
            <div className="keypad">
              {KEYS.map((k, i) =>
                k === '' ? (
                  <span key={i} />
                ) : (
                  <button key={i} onClick={() => press(k)} aria-label={k === 'del' ? 'Effacer un chiffre' : k}>
                    {k === 'del' ? <Icon name="erase" size={24} /> : k}
                  </button>
                )
              )}
            </div>
          )}
          <div className="stack gap10 mt14">
            {epubMode ? (
              <button className="btn primary" onClick={readChapters} disabled={!fresh}>
                <Icon name="sparkle" />
                {range.length > 1 ? `Lire les chapitres ${range[0].idx} à ${n}` : `Lire le chapitre ${n}`}
              </button>
            ) : (
              <button className="btn primary" onClick={() => fromMemoryOrPhoto()} disabled={!fresh}>
                <Icon name="sparkle" />
                Trouver les nouveautés
              </button>
            )}
            <div className="hstack">
              {!epubMode && (
                <label className="btn" style={{ flex: 1, cursor: fresh ? 'pointer' : 'default', opacity: fresh ? 1 : 0.5 }}>
                  <Icon name="camera" />
                  Photo
                  <input type="file" accept="image/*" capture="environment" className="sr" disabled={!fresh} onChange={(e) => e.target.files?.[0] && fromMemoryOrPhoto(e.target.files[0])} />
                </label>
              )}
              <button className="btn" style={{ flex: 1 }} onClick={justSave} disabled={!n}>
                Juste enregistrer
              </button>
            </div>
          </div>
        </>
      )}

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
    </main>
  )
}
