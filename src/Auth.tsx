import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type User } from './api'
import { Icon } from './components/Icon'

const AuthCtx = createContext<{ user: User; logout: () => void } | null>(null)
export const useAuth = () => useContext(AuthCtx)!

function Login({ onLogged }: { onLogged: (u: User) => void }) {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onLogged((await api.login(id, password)).user)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="screen" style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div className="eyebrow">Mais c'est qui ?</div>
      <h1 className="display" style={{ fontSize: 34, marginBottom: 22 }}>
        Ton carnet de lecture
      </h1>
      <form onSubmit={submit} className="card" style={{ padding: 18 }}>
        <div className="field">
          <label htmlFor="login-id">Identifiant</label>
          <input id="login-id" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={id} onChange={(e) => setId(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="login-pass">Mot de passe</label>
          <input id="login-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && (
          <p role="alert" className="small" style={{ color: 'var(--danger)', margin: '0 0 12px' }}>
            {error}
          </p>
        )}
        <button className="btn primary block" disabled={busy}>
          <Icon name="bookmark" />
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  )
}

// Affiche l'app si une session est ouverte, sinon l'écran de connexion
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    api.me().then(
      (r) => setUser(r.user),
      () => setUser(null)
    )
    const lost = () => setUser(null)
    window.addEventListener('mcq:logged-out', lost)
    return () => window.removeEventListener('mcq:logged-out', lost)
  }, [])

  if (user === undefined)
    return (
      <div className="screen">
        <p className="muted">Chargement…</p>
      </div>
    )
  if (!user) return <Login onLogged={setUser} />
  const logout = () => {
    api.logout().finally(() => setUser(null))
  }
  return <AuthCtx.Provider value={{ user, logout }}>{children}</AuthCtx.Provider>
}
