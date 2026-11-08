import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import './styles.css'
import { ToastProvider } from './components/ui'
import { BookLayout } from './BookContext'
import { AuthGate } from './Auth'
import Library from './pages/Library'
import Notebook from './pages/Notebook'
import PageEntry from './pages/PageEntry'
import Review from './pages/Review'
import EntityView from './pages/EntityView'
import Tree from './pages/Tree'
import Links from './pages/Links'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthGate>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/livre/:bookId" element={<BookLayout />}>
              <Route index element={<Notebook />} />
              <Route path="page" element={<PageEntry />} />
              <Route path="nouveautes" element={<Review />} />
              <Route path="fiche/:entityId" element={<EntityView />} />
              <Route path="arbre" element={<Tree />} />
              <Route path="liens" element={<Links />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthGate>
    </ToastProvider>
  </React.StrictMode>,
)
