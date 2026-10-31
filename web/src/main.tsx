import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { LangProvider } from './i18n'
import ActionLink from './pages/ActionLink'
import Banks from './pages/Banks'
import Home from './pages/Home'
import Join from './pages/Join'
import Me from './pages/Me'
import NewRequest from './pages/NewRequest'
import RequestPage from './pages/RequestPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/banks" element={<Banks />} />
          <Route path="/request" element={<NewRequest />} />
          <Route path="/join" element={<Join />} />
          <Route path="/me" element={<Me />} />
          <Route path="/r/:token" element={<RequestPage />} />
          <Route path="/a/:token" element={<ActionLink />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </LangProvider>
  </StrictMode>,
)
