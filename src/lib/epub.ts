// Lecture d'un EPUB dans le navigateur : chapitres dans l'ordre de lecture, avec leur titre et leur texte brut.
// Le fichier ne quitte pas le téléphone : seul le texte des chapitres choisis est envoyé à l'app.

export interface EpubChapter {
  title: string
  text: string
  words: number
  // Proposé décoché : sommaire, mentions légales…
  extra: boolean
}

export interface EpubBook {
  title: string
  author: string
  chapters: EpubChapter[]
}

const EXTRA = /^(table des mati[eè]res|sommaire|copyright|licen[cs]e|du m[eê]me auteur|des m[eê]mes auteurs|remerciements|cr[ée]dits|page de titre|couverture|cover|title page|contents|[àa] propos|dans la m[eê]me collection|achev[ée] d'imprimer)/i

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')
const resolve = (base: string, href: string) => {
  const parts = (base + decodeURIComponent(href.split('#')[0])).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.') out.push(p)
  }
  return out.join('/')
}

function parseXml(text: string, type: DOMParserSupportedType = 'application/xhtml+xml') {
  let doc = new DOMParser().parseFromString(text, type)
  // XHTML mal formé : on retente en HTML, plus tolérant
  if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(text, 'text/html')
  return doc
}

const byLocal = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name))

function textOf(doc: Document): string {
  const body = doc.body || doc.documentElement
  body.querySelectorAll('script, style').forEach((el) => el.remove())
  body.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, br, blockquote, tr, section').forEach((el) => el.append('\n'))
  return (body.textContent || '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export async function readEpub(file: File): Promise<EpubBook> {
  const { unzipSync, strFromU8 } = await import('fflate')
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error("Ce fichier n'est pas un EPUB lisible.")
  }
  const get = (p: string) => {
    const k = files[p] ? p : Object.keys(files).find((x) => x.toLowerCase() === p.toLowerCase())
    return k ? strFromU8(files[k]) : null
  }
  if (!get('META-INF/container.xml')) {
    if (Object.keys(files).some((k) => /\.drm|rights\.xml|encryption\.xml/i.test(k))) throw new Error('Cet EPUB est protégé (DRM) : il ne peut pas être lu.')
    throw new Error("Ce fichier n'est pas un EPUB lisible.")
  }
  const container = parseXml(get('META-INF/container.xml')!, 'application/xml')
  const opfPath = byLocal(container, 'rootfile')[0]?.getAttribute('full-path') || ''
  const opfText = get(opfPath)
  if (!opfText) throw new Error("Impossible de trouver le contenu de l'EPUB.")
  if (get('META-INF/encryption.xml')?.includes('EncryptedData')) throw new Error('Cet EPUB est protégé (DRM) : il ne peut pas être lu.')
  const opf = parseXml(opfText, 'application/xml')
  const base = dirOf(opfPath)

  const manifest = new Map<string, { href: string; type: string; props: string }>()
  for (const it of byLocal(opf, 'item')) manifest.set(it.getAttribute('id') || '', { href: resolve(base, it.getAttribute('href') || ''), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' })
  const spine = byLocal(opf, 'itemref')
    .filter((r) => r.getAttribute('linear') !== 'no')
    .map((r) => manifest.get(r.getAttribute('idref') || '')?.href)
    .filter((h): h is string => !!h)

  // Titres de la table des matières : EPUB 3 (nav) ou EPUB 2 (toc.ncx). Fichier → premier titre qui le cite.
  const tocTitles = new Map<string, string>()
  const nav = [...manifest.values()].find((m) => m.props.split(' ').includes('nav'))
  if (nav && get(nav.href)) {
    const doc = parseXml(get(nav.href)!)
    const tocNav = byLocal(doc, 'nav').find((n) => (n.getAttribute('epub:type') || n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '').includes('toc')) || byLocal(doc, 'nav')[0]
    for (const a of tocNav ? byLocal(tocNav, 'a') : []) {
      const href = resolve(dirOf(nav.href), a.getAttribute('href') || '')
      const t = (a.textContent || '').replace(/\s+/g, ' ').trim()
      if (t && !tocTitles.has(href)) tocTitles.set(href, t)
    }
  }
  if (!tocTitles.size) {
    const ncx = [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml')
    if (ncx && get(ncx.href)) {
      const doc = parseXml(get(ncx.href)!, 'application/xml')
      for (const np of byLocal(doc, 'navPoint')) {
        const src = byLocal(np, 'content')[0]?.getAttribute('src') || ''
        const t = (byLocal(np, 'text')[0]?.textContent || '').replace(/\s+/g, ' ').trim()
        const href = resolve(dirOf(ncx.href), src)
        if (t && !tocTitles.has(href)) tocTitles.set(href, t)
      }
    }
  }

  // Un chapitre commence à chaque fichier cité dans la table des matières ; les fichiers suivants s'y ajoutent.
  // Sans table des matières, chaque fichier est un chapitre.
  const chapters: { title: string; text: string }[] = []
  for (const href of spine) {
    const raw = get(href)
    if (!raw) continue
    const doc = parseXml(raw)
    const heading = doc.querySelector('h1, h2, h3')?.textContent?.replace(/\s+/g, ' ').trim()
    const text = textOf(doc)
    const startsChapter = !tocTitles.size || tocTitles.has(href) || !chapters.length
    if (startsChapter) chapters.push({ title: tocTitles.get(href) || heading || doc.title || '', text })
    else chapters[chapters.length - 1].text += '\n' + text
  }

  const meta = (name: string) => byLocal(opf, name)[0]?.textContent?.trim() || ''
  const result = finalizeChapters(chapters)
  // La page de titre porte le nom du livre : proposée décochée
  const bookTitle = meta('title').toLowerCase().trim()
  if (bookTitle && result[0]?.title.toLowerCase().trim() === bookTitle) result[0].extra = true
  return { title: meta('title'), author: meta('creator'), chapters: result }
}

// Nombre de mots, titre par défaut, et repérage de ce qui n'est pas un chapitre de l'histoire
export function finalizeChapters(chapters: { title: string; text: string }[]): EpubChapter[] {
  const result = chapters
    .filter((c) => c.text.trim().length > 0)
    .map((c) => {
      const words = c.text.split(/\s+/).length
      return { title: c.title || c.text.split('\n')[0].slice(0, 80), text: c.text, words, extra: words < 150 || EXTRA.test(c.title) }
    })
  if (!result.length) throw new Error('Aucun texte trouvé dans ce fichier.')
  return result
}
