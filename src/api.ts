import type { ApplyPayload, Book, BookFull, Entity, PendingRef, Relation, Suggestions, Unit } from '../shared/model'

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api' + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new Error('Pas de connexion. Vérifie ton réseau et réessaie.')
  }
  const data = await res.json().catch(() => ({}))
  // Session expirée : l'écran de connexion reprend la main
  if (res.status === 401 && !url.startsWith('/login')) window.dispatchEvent(new Event('mcq:logged-out'))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Erreur ${res.status}`)
  return data as T
}

export interface Lookup {
  title: string
  author: string
  publisher: string
  year: string
  pages: number | null
  isbn: string
  coverId: number | null
  source: 'bnf' | 'openlibrary'
}

export interface User {
  id: string
  label: string
}

export const api = {
  me: () => call<{ user: User }>('GET', '/me'),
  login: (id: string, password: string) => call<{ user: User }>('POST', '/login', { id, password }),
  logout: () => call('POST', '/logout'),
  books: () => call<Book[]>('GET', '/books'),
  addBook: (b: { title: string; author: string; total_pages: number | null; cover: string | null; isbn?: string; publisher?: string; year?: string }) => call<Book>('POST', '/books', b),
  updateBook: (id: string, b: Partial<Book> & { cover?: string | null }) => call<Book>('PATCH', `/books/${id}`, b),
  deleteBook: (id: string) => call('DELETE', `/books/${id}`),
  full: (id: string) => call<BookFull>('GET', `/books/${id}/full`),
  addEntity: (bookId: string, e: Partial<Entity>) => call<Entity>('POST', `/books/${bookId}/entities`, e),
  updateEntity: (id: string, e: Partial<Entity>) => call<Entity>('PATCH', `/entities/${id}`, e),
  deleteEntity: (id: string) => call('DELETE', `/entities/${id}`),
  addRelation: (bookId: string, r: Partial<Relation>) => call<Relation>('POST', `/books/${bookId}/relations`, r),
  updateRelation: (id: string, r: Partial<Relation>) => call<Relation>('PATCH', `/relations/${id}`, r),
  deleteRelation: (id: string) => call('DELETE', `/relations/${id}`),
  suggest: (bookId: string, q: { unit: Unit; at: number; ocrText?: string; useEpub?: boolean; part?: number; pending?: PendingRef[] }) =>
    call<Suggestions>('POST', `/books/${bookId}/suggest`, q),
  importEpub: (bookId: string, chapters: { title: string; text: string }[]) => call<Book>('POST', `/books/${bookId}/epub`, { chapters }),
  deleteEpub: (bookId: string) => call('DELETE', `/books/${bookId}/epub`),
  apply: (bookId: string, p: ApplyPayload) => call<{ added: number }>('POST', `/books/${bookId}/apply`, p),
  lookup: (q: string) => call<Lookup[]>('GET', `/lookup?q=${encodeURIComponent(q)}`)
}

export const coverUrl = (b: Pick<Book, 'id' | 'has_cover'>, bust = '') => (b.has_cover ? `/api/books/${b.id}/cover${bust ? `?v=${bust}` : ''}` : null)
