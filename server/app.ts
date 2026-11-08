import { Hono } from 'hono'
import type { Env } from './lib/env'
import { AuthError, currentUser, login, logout, requireUser, type User } from './lib/auth'
import { partSize, splitText, suggestFromMemory, suggestFromText } from './lib/ai'
import { findEditions } from './lib/lookup'
import type { ApplyPayload, Book, Entity, PendingRef, Relation, Unit } from '../shared/model'

const app = new Hono<{ Bindings: Env; Variables: { user: User } }>().basePath('/api')

// ---------- Connexion (seules routes accessibles sans session) ----------

app.post('/login', async (c) => {
  const body = await c.req.json<{ id?: string; password?: string }>().catch(() => ({}) as { id?: string; password?: string })
  const { user, cookie } = await login(c.env.DB, body.id, body.password)
  return c.json({ user }, 200, { 'Set-Cookie': cookie })
})

app.post('/logout', async (c) => c.json({ ok: true }, 200, { 'Set-Cookie': await logout(c.env.DB, c.req.raw) }))

app.get('/me', async (c) => {
  const user = await currentUser(c.env.DB, c.req.raw)
  return user ? c.json({ user }) : c.json({ error: 'Non connecté.' }, 401)
})

app.use('*', requireUser)

app.onError((err, c) => {
  if (err instanceof AuthError) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'Erreur serveur : ' + (err instanceof Error ? err.message : String(err)) }, 500)
})

const uid = () => crypto.randomUUID()
const intOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Math.max(0, Math.round(Number(v))) || null)
const parseEntity = (row: Record<string, unknown>): Entity => ({ ...(row as unknown as Entity), data: JSON.parse((row.data as string) || '{}') })

async function getBook(db: D1Database, id: string) {
  return db.prepare('SELECT b.*, (SELECT 1 FROM covers c WHERE c.book_id = b.id) AS has_cover, (SELECT COUNT(*) FROM chapters ch WHERE ch.book_id = b.id) AS chapter_count FROM books b WHERE b.id = ?').bind(id).first<Book>()
}

// ---------- Livres ----------

app.get('/books', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT b.*,
       (SELECT 1 FROM covers c WHERE c.book_id = b.id) AS has_cover,
       (SELECT COUNT(*) FROM entities e WHERE e.book_id = b.id) AS entity_count,
       (SELECT COUNT(*) FROM relations r WHERE r.book_id = b.id) AS relation_count,
       (SELECT COUNT(*) FROM chapters ch WHERE ch.book_id = b.id) AS chapter_count
     FROM books b ORDER BY b.finished, b.created_at DESC`
  ).all<Book>()
  return c.json(results)
})

app.post('/books', async (c) => {
  const body = await c.req.json<{ title?: string; author?: string; total_pages?: number; total_chapters?: number; unit?: Unit; cover?: string | null; isbn?: string; publisher?: string; year?: string }>()
  const title = (body.title || '').trim()
  if (!title) return c.json({ error: 'Le titre est obligatoire.' }, 400)
  const id = uid()
  const stmts = [c.env.DB.prepare('INSERT INTO books (id, title, author, total_pages, total_chapters, unit, isbn, publisher, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, title, (body.author || '').trim(), intOrNull(body.total_pages), intOrNull(body.total_chapters), body.unit === 'chapter' ? 'chapter' : 'page', (body.isbn || '').trim(), (body.publisher || '').trim(), (body.year || '').trim())]
  if (body.cover) stmts.push(c.env.DB.prepare('INSERT INTO covers (book_id, data_url) VALUES (?, ?)').bind(id, body.cover))
  await c.env.DB.batch(stmts)
  return c.json(await getBook(c.env.DB, id), 201)
})

app.patch('/books/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<Partial<Book> & { cover?: string | null }>()
  const sets: string[] = []
  const vals: unknown[] = []
  if (body.title !== undefined) {
    if (!body.title.trim()) return c.json({ error: 'Le titre est obligatoire.' }, 400)
    sets.push('title = ?'), vals.push(body.title.trim())
  }
  if (body.author !== undefined) sets.push('author = ?'), vals.push(body.author.trim())
  if (body.total_pages !== undefined) sets.push('total_pages = ?'), vals.push(intOrNull(body.total_pages))
  if (body.current_page !== undefined) sets.push('current_page = ?'), vals.push(intOrNull(body.current_page) ?? 0)
  if (body.total_chapters !== undefined) sets.push('total_chapters = ?'), vals.push(intOrNull(body.total_chapters))
  if (body.current_chapter !== undefined) sets.push('current_chapter = ?'), vals.push(intOrNull(body.current_chapter) ?? 0)
  if (body.unit !== undefined) sets.push('unit = ?'), vals.push(body.unit === 'chapter' ? 'chapter' : 'page')
  if (body.finished !== undefined) sets.push('finished = ?'), vals.push(body.finished ? 1 : 0)
  for (const k of ['isbn', 'publisher', 'year'] as const) if (body[k] !== undefined) sets.push(`${k} = ?`), vals.push(String(body[k]).trim())
  const stmts: D1PreparedStatement[] = []
  if (sets.length) stmts.push(c.env.DB.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id))
  if (body.cover === null) stmts.push(c.env.DB.prepare('DELETE FROM covers WHERE book_id = ?').bind(id))
  else if (body.cover) stmts.push(c.env.DB.prepare('INSERT OR REPLACE INTO covers (book_id, data_url) VALUES (?, ?)').bind(id, body.cover))
  if (stmts.length) await c.env.DB.batch(stmts)
  const book = await getBook(c.env.DB, id)
  return book ? c.json(book) : c.json({ error: 'Livre introuvable.' }, 404)
})

app.delete('/books/:id', async (c) => {
  const id = c.req.param('id')
  // D1 n'active pas toujours les cascades : on supprime explicitement
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM relations WHERE book_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM entities WHERE book_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM covers WHERE book_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM chapters WHERE book_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM books WHERE id = ?').bind(id)
  ])
  return c.json({ ok: true })
})

app.get('/books/:id/cover', async (c) => {
  const row = await c.env.DB.prepare('SELECT data_url FROM covers WHERE book_id = ?').bind(c.req.param('id')).first<{ data_url: string }>()
  if (!row) return c.body(null, 404)
  const m = row.data_url.match(/^data:([^;]+);base64,(.*)$/)
  if (!m) return c.body(null, 404)
  const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0))
  return c.body(bytes, 200, { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=31536000, immutable' })
})

app.get('/books/:id/full', async (c) => {
  const id = c.req.param('id')
  const book = await getBook(c.env.DB, id)
  if (!book) return c.json({ error: 'Livre introuvable.' }, 404)
  const [ents, rels, chs] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM entities WHERE book_id = ? ORDER BY name COLLATE NOCASE').bind(id),
    c.env.DB.prepare('SELECT * FROM relations WHERE book_id = ?').bind(id),
    c.env.DB.prepare('SELECT idx, title, words FROM chapters WHERE book_id = ? ORDER BY idx').bind(id)
  ])
  return c.json({ book, entities: (ents.results as Record<string, unknown>[]).map(parseEntity), relations: rels.results as unknown as Relation[], chapters: chs.results })
})

// ---------- Fiches ----------

const cleanData = (d: unknown) => {
  const out: Record<string, string> = {}
  if (d && typeof d === 'object') for (const [k, v] of Object.entries(d)) if (typeof v === 'string' && v.trim()) out[k] = v.trim()
  return out
}

app.post('/books/:id/entities', async (c) => {
  const b = await c.req.json<Partial<Entity>>()
  const name = (b.name || '').trim()
  if (!name) return c.json({ error: 'Le nom est obligatoire.' }, 400)
  if (!['character', 'place', 'org', 'event'].includes(b.kind || '')) return c.json({ error: 'Type de fiche inconnu.' }, 400)
  const id = uid()
  await c.env.DB.prepare('INSERT INTO entities (id, book_id, kind, name, data, notes, first_page, first_chapter, to_clarify) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, c.req.param('id'), b.kind, name, JSON.stringify(cleanData(b.data)), (b.notes || '').trim(), intOrNull(b.first_page), intOrNull(b.first_chapter), b.to_clarify ? 1 : 0)
    .run()
  const row = await c.env.DB.prepare('SELECT * FROM entities WHERE id = ?').bind(id).first<Record<string, unknown>>()
  return c.json(parseEntity(row!), 201)
})

app.patch('/entities/:id', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json<Partial<Entity>>()
  const sets: string[] = []
  const vals: unknown[] = []
  if (b.name !== undefined) {
    if (!b.name.trim()) return c.json({ error: 'Le nom est obligatoire.' }, 400)
    sets.push('name = ?'), vals.push(b.name.trim())
  }
  if (b.data !== undefined) sets.push('data = ?'), vals.push(JSON.stringify(cleanData(b.data)))
  if (b.notes !== undefined) sets.push('notes = ?'), vals.push(b.notes)
  if (b.first_page !== undefined) sets.push('first_page = ?'), vals.push(intOrNull(b.first_page))
  if (b.first_chapter !== undefined) sets.push('first_chapter = ?'), vals.push(intOrNull(b.first_chapter))
  if (b.to_clarify !== undefined) sets.push('to_clarify = ?'), vals.push(b.to_clarify ? 1 : 0)
  if (sets.length) await c.env.DB.prepare(`UPDATE entities SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run()
  const row = await c.env.DB.prepare('SELECT * FROM entities WHERE id = ?').bind(id).first<Record<string, unknown>>()
  return row ? c.json(parseEntity(row)) : c.json({ error: 'Fiche introuvable.' }, 404)
})

app.delete('/entities/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM relations WHERE from_id = ? OR to_id = ?').bind(id, id),
    c.env.DB.prepare('DELETE FROM entities WHERE id = ?').bind(id)
  ])
  return c.json({ ok: true })
})

// ---------- Relations ----------

const KINS = ['parent', 'spouse', 'sibling']

app.post('/books/:id/relations', async (c) => {
  const b = await c.req.json<Partial<Relation>>()
  if (!b.from_id || !b.to_id || b.from_id === b.to_id) return c.json({ error: 'Choisis deux fiches différentes.' }, 400)
  const id = uid()
  await c.env.DB.prepare('INSERT INTO relations (id, book_id, from_id, to_id, category, from_role, to_role, label, kin, first_page) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, c.req.param('id'), b.from_id, b.to_id, b.category || 'Autre', (b.from_role || '').trim(), (b.to_role || '').trim(), (b.label || '').trim(), KINS.includes(b.kin || '') ? b.kin : null, intOrNull(b.first_page))
    .run()
  return c.json(await c.env.DB.prepare('SELECT * FROM relations WHERE id = ?').bind(id).first<Relation>(), 201)
})

app.patch('/relations/:id', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json<Partial<Relation>>()
  const sets: string[] = []
  const vals: unknown[] = []
  for (const k of ['category', 'from_role', 'to_role', 'label'] as const) if (b[k] !== undefined) sets.push(`${k} = ?`), vals.push(String(b[k]).trim())
  if (b.kin !== undefined) sets.push('kin = ?'), vals.push(KINS.includes(b.kin || '') ? b.kin : null)
  if (b.from_id && b.to_id) sets.push('from_id = ?', 'to_id = ?'), vals.push(b.from_id, b.to_id)
  if (sets.length) await c.env.DB.prepare(`UPDATE relations SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run()
  return c.json(await c.env.DB.prepare('SELECT * FROM relations WHERE id = ?').bind(id).first<Relation>())
})

app.delete('/relations/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM relations WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// ---------- EPUB ----------

app.post('/books/:id/epub', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ chapters?: { title?: string; text?: string }[] }>()
  const chapters = (body.chapters || []).filter((ch) => (ch.text || '').trim().length > 0)
  if (!chapters.length) return c.json({ error: "Aucun chapitre trouvé dans l'EPUB." }, 400)
  const db = c.env.DB
  const stmts = [db.prepare('DELETE FROM chapters WHERE book_id = ?').bind(id)]
  chapters.forEach((ch, i) => {
    const text = (ch.text || '').trim()
    stmts.push(db.prepare('INSERT INTO chapters (book_id, idx, title, text, words) VALUES (?, ?, ?, ?, ?)').bind(id, i + 1, (ch.title || '').trim().slice(0, 200), text, text.split(/\s+/).length))
  })
  stmts.push(db.prepare("UPDATE books SET unit = 'chapter', total_chapters = ? WHERE id = ?").bind(chapters.length, id))
  // Par lots pour rester dans les limites de D1
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40))
  return c.json(await getBook(db, id))
})

app.delete('/books/:id/epub', async (c) => {
  await c.env.DB.prepare('DELETE FROM chapters WHERE book_id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// ---------- Nouveautés (IA) ----------

async function context(env: Env, id: string, pending: PendingRef[] = []) {
  const book = await getBook(env.DB, id)
  if (!book) return null
  const [ents, rels] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM entities WHERE book_id = ?').bind(id),
    env.DB.prepare('SELECT * FROM relations WHERE book_id = ?').bind(id)
  ])
  return { env, book, entities: (ents.results as Record<string, unknown>[]).map(parseEntity), relations: rels.results as unknown as Relation[], pending }
}

const quota = (e: unknown) => /quota|4006|429|neuron/i.test(String(e))

// Corps : { unit, at, from?, ocrText? } pour la mémoire de l'IA ou une photo,
//         { unit: 'chapter', at, useEpub: true, part, pending } pour lire un chapitre de l'EPUB (un morceau par appel)
app.post('/books/:id/suggest', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ unit?: Unit; at?: number; from?: number; ocrText?: string; part?: number; pending?: PendingRef[]; useEpub?: boolean }>()
  const ctx = await context(c.env, id, Array.isArray(body.pending) ? body.pending.slice(0, 300) : [])
  if (!ctx) return c.json({ error: 'Livre introuvable.' }, 404)
  const unit: Unit = body.unit === 'chapter' ? 'chapter' : 'page'
  const at = intOrNull(body.at)
  if (!at) return c.json({ error: unit === 'chapter' ? 'Indique ton chapitre.' : 'Indique ta page.' }, 400)
  try {
    if (unit === 'chapter' && body.useEpub) {
      const ch = await c.env.DB.prepare('SELECT idx, title, text FROM chapters WHERE book_id = ? AND idx = ?').bind(id, at).first<{ idx: number; title: string; text: string }>()
      if (!ch) return c.json({ error: `Chapitre ${at} introuvable dans l'EPUB.` }, 404)
      const parts = splitText(ch.text, partSize(c.env))
      const part = Math.min(Math.max(0, intOrNull(body.part) ?? 0), parts.length - 1)
      const where = `chapitre ${at}${ch.title ? ` « ${ch.title} »` : ''}${parts.length > 1 ? `, partie ${part + 1} sur ${parts.length}` : ''}`
      const s = await suggestFromText(ctx, 'chapter', at, where, parts[part], 'epub', `new:c${at}p${part}:`)
      return c.json({ ...s, parts: parts.length })
    }
    if (body.ocrText && body.ocrText.trim().length > 40) {
      const where = `${unit === 'chapter' ? 'chapitre' : 'page'} ${at} (photo, le texte peut contenir des erreurs de lecture)`
      return c.json(await suggestFromText(ctx, unit, at, where, body.ocrText.slice(0, 8000), 'photo', 'new:'))
    }
    const scanned = unit === 'chapter' ? ctx.book.scanned_chapter : ctx.book.scanned_page
    const from = Math.max(1, Math.min(intOrNull(body.from) ?? scanned + 1, at))
    return c.json(await suggestFromMemory(ctx, unit, from, at))
  } catch (e) {
    if (quota(e)) return c.json({ error: "Le quota gratuit d'IA du jour est atteint. Réessaie demain, ou ajoute tes fiches à la main." }, 429)
    throw e
  }
})

app.post('/books/:id/apply', async (c) => {
  const bookId = c.req.param('id')
  const body = await c.req.json<ApplyPayload>()
  const db = c.env.DB
  const unit: Unit = body.unit === 'chapter' ? 'chapter' : 'page'
  const at = intOrNull(body.at)
  const stmts: D1PreparedStatement[] = []
  const idFor = new Map<string, string>()

  for (const e of body.entities || []) {
    if (!e.name?.trim()) continue
    const id = uid()
    idFor.set(e.key, id)
    const first = intOrNull(e.first_at) ?? at
    stmts.push(
      db
        .prepare('INSERT INTO entities (id, book_id, kind, name, data, first_page, first_chapter) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, bookId, e.kind, e.name.trim(), JSON.stringify(cleanData(e.data)), unit === 'page' ? first : null, unit === 'chapter' ? first : null)
    )
  }

  if (body.updates?.length) {
    const ids = body.updates.map((u) => u.id)
    const { results } = await db.prepare(`SELECT * FROM entities WHERE book_id = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(bookId, ...ids).all<Record<string, unknown>>()
    for (const row of results) {
      const e = parseEntity(row)
      const u = body.updates.find((x) => x.id === e.id)!
      const data = { ...e.data }
      for (const [k, v] of Object.entries(u.facts)) if (!data[k] && v) data[k] = v
      stmts.push(db.prepare('UPDATE entities SET data = ? WHERE id = ?').bind(JSON.stringify(cleanData(data)), e.id))
    }
  }

  const ref = (r: string) => idFor.get(r) || (r.startsWith('new:') ? null : r)
  for (const r of body.relations || []) {
    const from = ref(r.from_ref)
    const to = ref(r.to_ref)
    if (!from || !to || from === to) continue
    stmts.push(
      db
        .prepare('INSERT INTO relations (id, book_id, from_id, to_id, category, from_role, to_role, kin, first_page, first_chapter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(uid(), bookId, from, to, r.category || 'Autre', r.from_role || '', r.to_role || '', KINS.includes(r.kin || '') ? r.kin : null, unit === 'page' ? at : null, unit === 'chapter' ? at : null)
    )
  }

  if (at)
    stmts.push(
      unit === 'chapter'
        ? db.prepare("UPDATE books SET unit = 'chapter', scanned_chapter = MAX(scanned_chapter, ?), current_chapter = MAX(current_chapter, ?) WHERE id = ?").bind(at, at, bookId)
        : db.prepare("UPDATE books SET unit = 'page', scanned_page = MAX(scanned_page, ?), current_page = MAX(current_page, ?) WHERE id = ?").bind(at, at, bookId)
    )
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))
  return c.json({ ok: true, added: idFor.size })
})

// ---------- Recherche d'édition (BnF + Open Library, gratuits) ----------

app.get('/lookup', async (c) => {
  const q = (c.req.query('q') || '').trim()
  if (q.length < 2) return c.json([])
  return c.json(await findEditions(q))
})

app.get('/lookup/cover/:id', async (c) => {
  const id = c.req.param('id').replace(/\D/g, '')
  const res = await fetch(`https://covers.openlibrary.org/b/id/${id}-M.jpg`)
  if (!res.ok) return c.body(null, 404)
  return c.body(await res.arrayBuffer(), 200, { 'Content-Type': res.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' })
})

// ---------- Export ----------

app.get('/books/:id/export', async (c) => {
  const id = c.req.param('id')
  const book = await getBook(c.env.DB, id)
  if (!book) return c.json({ error: 'Livre introuvable.' }, 404)
  const [ents, rels] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM entities WHERE book_id = ?').bind(id),
    c.env.DB.prepare('SELECT * FROM relations WHERE book_id = ?').bind(id)
  ])
  return c.json({ version: 1, book, entities: (ents.results as Record<string, unknown>[]).map(parseEntity), relations: rels.results })
})

export default app
