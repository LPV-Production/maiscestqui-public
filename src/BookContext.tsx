import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import type { BookFull, Entity, Suggestions } from '../shared/model'
import { api } from './api'
import { ErrorBox, Loading } from './components/ui'

interface Ctx extends BookFull {
  reload: () => Promise<void>
  byId: Map<string, Entity>
  suggestions: Suggestions | null
  setSuggestions: (s: Suggestions | null) => void
}

const BookCtx = createContext<Ctx | null>(null)
export const useBook = () => useContext(BookCtx)!

// Charge un livre (fiches + relations) une fois pour tous ses écrans
export function BookLayout() {
  const { bookId = '' } = useParams()
  const [full, setFull] = useState<BookFull | null>(null)
  const [error, setError] = useState('')
  const key = `sugg:${bookId}`
  const [suggestions, setSuggState] = useState<Suggestions | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || 'null')
    } catch {
      return null
    }
  })
  const setSuggestions = useCallback(
    (s: Suggestions | null) => {
      setSuggState(s)
      try {
        if (s) sessionStorage.setItem(key, JSON.stringify(s))
        else sessionStorage.removeItem(key)
      } catch {
        /* stockage indisponible : on garde en mémoire */
      }
    },
    [key]
  )

  const reload = useCallback(async () => {
    try {
      setFull(await api.full(bookId))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [bookId])

  useEffect(() => {
    setFull(null)
    reload()
  }, [reload])

  if (error && !full)
    return (
      <div className="screen">
        <ErrorBox error={error} retry={reload} />
      </div>
    )
  if (!full) return <Loading />
  const byId = new Map(full.entities.map((e) => [e.id, e]))
  return (
    <BookCtx.Provider value={{ ...full, reload, byId, suggestions, setSuggestions }}>
      <Outlet />
    </BookCtx.Provider>
  )
}
