import { useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useT } from './i18n'
import { Wordmark } from './ui'

export const WA_NUMBER = import.meta.env.VITE_WA_NUMBER ?? ''
export const waHiLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hi')}`

/** Full-width public website frame: navigation + footer. The task flows use the narrower <Shell>. */
export function SiteShell({ children }: { children: ReactNode }) {
  const { t, toggle } = useT()
  const [open, setOpen] = useState(false)
  const links: [string, string][] = [['/banks', t.navBanks], ['/join', t.navDonate], ['/#how', t.navHow], ['/#faq', t.navFaq]]

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-[1000] border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-6">
          <Link to="/" className="no-underline" aria-label={t.appName}><Wordmark /></Link>
          <nav className="ml-4 hidden items-center gap-6 md:flex">
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => `font-medium no-underline hover:text-ink ${isActive && to === '/banks' ? 'text-ink' : 'text-muted'}`}>{label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggle} className="min-h-9 rounded-full border border-line bg-card px-3 text-sm text-muted hover:text-ink">{t.langSwitch}</button>
            <Link to="/request" className="hidden min-h-10 items-center rounded-xl bg-blood px-4 font-bold text-white no-underline hover:bg-[#B00E28] sm:flex">{t.needBlood}</Link>
            <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t.menu} className="flex h-11 w-11 items-center justify-center rounded-lg md:hidden">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-line px-4 pb-4 md:hidden">
            {links.map(([to, label]) => (
              <Link key={to} to={to} onClick={() => setOpen(false)} className="block py-3 text-lg font-bold text-ink no-underline">{label}</Link>
            ))}
            <Link to="/me" onClick={() => setOpen(false)} className="block py-3 text-lg font-bold text-ink no-underline">{t.myRaksha}</Link>
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-20 bg-ink text-white/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[2fr_1fr_1fr] md:px-6">
          <div>
            <Wordmark light />
            <p className="mt-3 max-w-sm">{t.footerAbout}</p>
            <p className="mt-4 max-w-sm text-sm text-white/60">{t.footerDisclaimer}</p>
          </div>
          <ul className="space-y-2">
            <li><Link to="/request" className="text-white no-underline">{t.needBlood}</Link></li>
            <li><Link to="/banks" className="text-white no-underline">{t.navBanks}</Link></li>
            <li><Link to="/join" className="text-white no-underline">{t.navDonate}</Link></li>
          </ul>
          <ul className="space-y-2">
            <li><Link to="/me" className="text-white no-underline">{t.myRaksha}</Link></li>
            <li><a href="/#faq" className="text-white no-underline">{t.navFaq}</a></li>
            {WA_NUMBER && <li><a href={waHiLink} className="text-white no-underline">WhatsApp</a></li>}
          </ul>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-white/50 md:px-6">{t.footerData}</p>
      </footer>
    </div>
  )
}

export function Section({ id, title, sub, children, className = '' }: { id?: string; title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 md:px-6 ${className}`}>
      <h2 className="display text-[2.2rem] md:text-[2.8rem]">{title}</h2>
      {sub && <p className="mt-2 max-w-2xl text-lg text-muted">{sub}</p>}
      <div className="mt-8">{children}</div>
    </section>
  )
}
