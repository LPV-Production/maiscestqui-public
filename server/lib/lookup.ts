// Recherche d'éditions : catalogue de la BnF (très complet pour les livres en français), puis Open Library.

export interface Edition {
  title: string
  author: string
  publisher: string
  year: string
  pages: number | null
  isbn: string
  coverId: number | null
  source: 'bnf' | 'openlibrary'
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .trim()

const all = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'g'))].map((m) => decode(m[1]))

// « Camut, Jérôme (1968-....). Auteur du texte » → « Jérôme Camut »
const person = (s: string) => {
  const name = s.replace(/\s*\(.*$/, '').replace(/\.\s*[A-ZÉ][^,]*$/, '')
  const [last, first] = name.split(',').map((x) => x.trim())
  return first ? `${first} ${last}` : last
}

async function bnf(q: string): Promise<Edition[]> {
  const words = q.replace(/["()]/g, ' ').trim()
  const url =
    'https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=dublincore&maximumRecords=30&query=' +
    encodeURIComponent(`bib.anywhere all "${words}" and bib.doctype any "a"`)
  const res = await fetch(url, { cf: { cacheTtl: 86400 } } as RequestInit)
  if (!res.ok) return []
  const xml = await res.text()
  const records = xml.split('<oai_dc:dc').slice(1)
  const out: Edition[] = []
  for (const r of records) {
    const isbn = all(r, 'identifier').find((i) => i.startsWith('ISBN'))?.replace(/[^\dX]/g, '') || ''
    const format = all(r, 'format').join(' ')
    const pages = format.match(/(\d+)\s*p\./)
    const lang = all(r, 'language')[0]
    if (!pages || (lang && lang !== 'fre')) continue
    const rawTitle = all(r, 'title')[0] || ''
    const title = rawTitle.split(' / ')[0].replace(/\s*:\s*roman$/i, '').trim()
    const creators = all(r, 'creator').filter((c) => /Auteur/.test(c))
    out.push({
      title,
      author: creators.map(person).join(' & '),
      publisher: (all(r, 'publisher')[0] || '').replace(/\s*\(.*\)\s*$/, '').replace(/^Éd(itions|\.)\s*/i, ''),
      year: (all(r, 'date')[0] || '').slice(0, 4),
      pages: Number(pages[1]),
      isbn,
      coverId: null,
      source: 'bnf'
    })
  }
  return out
}

async function openLibrary(q: string): Promise<Edition[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=6&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year,isbn`
  const res = await fetch(url, { headers: { 'User-Agent': 'Maiscestqui (lecture personnelle)' } })
  if (!res.ok) return []
  const data = await res.json<{ docs: { title: string; author_name?: string[]; cover_i?: number; number_of_pages_median?: number; first_publish_year?: number; isbn?: string[] }[] }>()
  return data.docs.map((d) => ({
    title: d.title,
    author: (d.author_name || []).slice(0, 2).join(' & '),
    publisher: '',
    year: d.first_publish_year ? String(d.first_publish_year) : '',
    pages: d.number_of_pages_median || null,
    isbn: d.isbn?.[0] || '',
    coverId: d.cover_i || null,
    source: 'openlibrary' as const
  }))
}

export async function findEditions(q: string): Promise<Edition[]> {
  const [a, b] = await Promise.all([bnf(q).catch(() => []), openLibrary(q).catch(() => [])])
  // Doublons BnF (même éditeur, même nombre de pages) : on garde le plus récent
  const seen = new Set<string>()
  const merged = [...a.sort((x, y) => y.year.localeCompare(x.year)), ...b].filter((e) => {
    const k = `${e.title.toLowerCase()}|${e.publisher.toLowerCase()}|${e.pages}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return merged.slice(0, 15)
}
