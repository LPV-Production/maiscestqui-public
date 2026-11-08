// Lecture d'un PDF dans le navigateur avec PDF.js : texte page par page, puis découpage en chapitres
// d'après les signets du PDF, sinon d'après les titres « Chapitre … », sinon par tranches de 20 pages.
import { finalizeChapters, type EpubBook } from './epub'

const ORDINAL = '(?:[0-9]+|[IVXLC]+|premier|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt)'
const CHAPTER_HEAD = new RegExp(`^\\s*(chapitre|chapter)\\s+${ORDINAL}\\b.{0,60}`, 'i')

const clean = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    // Numéros de page isolés
    .filter((l) => l && !/^\d{1,4}$/.test(l))
    .join('\n')

export async function readPdf(file: File, onProgress?: (pct: number) => void): Promise<EpubBook> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  } catch (e) {
    if (/password/i.test(String(e))) throw new Error('Ce PDF est protégé par un mot de passe.')
    throw new Error("Ce fichier n'est pas un PDF lisible.")
  }

  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    let text = ''
    for (const it of content.items) if ('str' in it) text += it.str + (it.hasEOL ? '\n' : ' ')
    pages.push(clean(text))
    onProgress?.(Math.round((i / doc.numPages) * 100))
  }
  if (pages.join('').length < 500) throw new Error("Ce PDF ne contient pas de texte (c'est sans doute un scan). Utilise plutôt la photo de page.")

  // 1. Signets du PDF (si le premier niveau ne contient que des « parties », on descend d'un niveau)
  let starts: { page: number; title: string }[] = []
  const outline = await doc.getOutline().catch(() => null)
  if (outline?.length) {
    let items = outline
    if (items.length < 4 && items.some((i) => i.items?.length)) items = items.flatMap((i) => (i.items?.length ? i.items : [i]))
    for (const it of items) {
      try {
        const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest
        if (!dest?.[0]) continue
        starts.push({ page: await doc.getPageIndex(dest[0]), title: it.title.trim() })
      } catch {
        /* signet cassé : ignoré */
      }
    }
  }

  // 2. Titres « Chapitre … » en haut de page (en ignorant les en-têtes répétés)
  if (starts.length < 2) {
    starts = []
    pages.forEach((t, i) => {
      const lines = t.split('\n')
      const at = lines.slice(0, 3).findIndex((l) => CHAPTER_HEAD.test(l))
      if (at < 0) return
      // Le titre du chapitre est souvent sur la ligne suivante, en capitales : « CHAPITRE II. » + « L'ANTICHAMBRE »
      const next = lines[at + 1] || ''
      const title = (lines[at] + (next.length < 80 && next === next.toUpperCase() && /\p{L}/u.test(next) ? ' ' + next : '')).trim()
      if (title !== starts[starts.length - 1]?.title) starts.push({ page: i, title })
    })
  }

  // 3. À défaut, par tranches de 20 pages
  if (starts.length < 2) {
    starts = []
    for (let i = 0; i < pages.length; i += 20) starts.push({ page: i, title: `Pages ${i + 1} à ${Math.min(i + 20, pages.length)}` })
  }

  starts = starts.sort((a, b) => a.page - b.page).filter((s, i, all) => i === 0 || s.page !== all[i - 1].page)
  if (starts[0].page > 0) starts.unshift({ page: 0, title: 'Début' })
  const chapters = starts.map((s, k) => ({ title: s.title, text: pages.slice(s.page, k + 1 < starts.length ? starts[k + 1].page : pages.length).join('\n') }))

  const info = ((await doc.getMetadata().catch(() => null))?.info || {}) as { Title?: string; Author?: string }
  return { title: info.Title || '', author: info.Author || '', chapters: finalizeChapters(chapters) }
}
