// Connexion : mots de passe, sessions, anti-devinette (même système que Resale_Manager).
// - Le mot de passe n'est jamais stocké : seulement une empreinte PBKDF2 salée.
// - Une fois connecté, le navigateur garde un jeton dans un cookie protégé
//   (illisible par JavaScript, envoyé uniquement à ce site, en HTTPS).
// - Après 5 essais ratés, l'identifiant est bloqué 15 minutes.
import type { MiddlewareHandler } from 'hono'
import type { Env } from './env'

export interface User {
  id: string
  label: string
}

export class AuthError extends Error {
  constructor(public status: 400 | 401 | 403 | 429, message: string) {
    super(message)
  }
}

const COOKIE = 'mcq_session'
const SESSION_DAYS = 90
const ITERATIONS = 100_000 // maximum autorisé par Cloudflare
const MAX_ATTEMPTS = 5
const LOCK_MS = 15 * 60_000

const enc = new TextEncoder()
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
}

// Format stocké : pbkdf2$100000$<sel>$<empreinte> (même format que scripts/creer-compte.mjs)
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`
}

async function verifyPassword(password: string, stored: string) {
  const [algo, iter, salt, hash] = stored.split('$')
  if (algo !== 'pbkdf2' || !salt || !hash) return false
  const got = new Uint8Array(await pbkdf2(password, unb64(salt), Number(iter)))
  const want = unb64(hash)
  if (got.length !== want.length) return false
  return crypto.subtle.timingSafeEqual(got, want)
}

const sha256 = async (s: string) => b64(await crypto.subtle.digest('SHA-256', enc.encode(s)))

function readCookie(req: Request) {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return m ? m[1] : null
}

const cookieHeader = (value: string, maxAge: number) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`

// Vérifie identifiant + mot de passe et ouvre une session. Renvoie l'utilisateur et le cookie à poser.
export async function login(db: D1Database, rawId: unknown, password: unknown) {
  const id = String(rawId ?? '').trim().toLowerCase()
  const pass = String(password ?? '')
  if (!id || !pass || id.length > 50 || pass.length > 200) throw new AuthError(400, 'Identifiant et mot de passe requis.')

  const now = Date.now()
  const attempt = await db.prepare('SELECT count, first_at FROM login_attempts WHERE key = ?').bind(id).first<{ count: number; first_at: number }>()
  if (attempt && attempt.count >= MAX_ATTEMPTS && now - attempt.first_at < LOCK_MS) {
    const min = Math.ceil((LOCK_MS - (now - attempt.first_at)) / 60_000)
    throw new AuthError(429, `Trop d’essais. Réessaie dans ${min} min.`)
  }

  const user = await db.prepare('SELECT id, label, password_hash FROM users WHERE id = ?').bind(id).first<User & { password_hash: string }>()
  // Même temps de calcul que l'utilisateur existe ou non (ne révèle pas les identifiants valides)
  const ok = user ? await verifyPassword(pass, user.password_hash) : (await hashPassword(pass), false)

  if (!ok || !user) {
    const fresh = !attempt || now - attempt.first_at >= LOCK_MS
    await db
      .prepare('INSERT INTO login_attempts (key, count, first_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = ?, first_at = ?')
      .bind(id, now, fresh ? 1 : attempt!.count + 1, fresh ? now : attempt!.first_at)
      .run()
    throw new AuthError(401, 'Identifiant ou mot de passe incorrect.')
  }

  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!)
  await db.batch([
    db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(id),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), user.id, now + SESSION_DAYS * 86_400_000)
  ])
  return { user: { id: user.id, label: user.label }, cookie: cookieHeader(token, SESSION_DAYS * 86_400) }
}

export async function currentUser(db: D1Database, req: Request): Promise<User | null> {
  const token = readCookie(req)
  if (!token) return null
  const row = await db
    .prepare('SELECT u.id, u.label FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(await sha256(token), Date.now())
    .first<User>()
  return row ?? null
}

export async function logout(db: D1Database, req: Request) {
  const token = readCookie(req)
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  return cookieHeader('', 0)
}

// Toutes les routes de l'API sauf la connexion exigent une session valide
export const requireUser: MiddlewareHandler<{ Bindings: Env; Variables: { user: User } }> = async (c, next) => {
  const user = await currentUser(c.env.DB, c.req.raw)
  if (!user) return c.json({ error: 'Non connecté.' }, 401)
  c.set('user', user)
  return next()
}
