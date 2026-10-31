import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { BloodGroup, Component } from './api'
import { useT } from './i18n'

/** "Raksha रक्षा": the name in both scripts, like a signboard. */
export function Wordmark({ light = false }: { light?: boolean }) {
  const { t, alt } = useT()
  return (
    <span className="flex items-center gap-1.5">
      <Drop className="h-7 w-7" />
      <span className={`display text-[1.6rem] ${light ? 'text-white' : 'text-ink'}`}>{t.appName}</span>
      <span className={`display mt-1 text-base ${light ? 'text-white/60' : 'text-muted'}`}>{alt.appName}</span>
    </span>
  )
}

export function Shell({ children, bar }: { children: ReactNode; bar?: ReactNode }) {
  const { t, toggle } = useT()
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <Link to="/" className="no-underline" aria-label={t.appName}><Wordmark /></Link>
        <button onClick={toggle} className="min-h-9 rounded-full border border-line bg-card px-3 text-sm text-muted hover:text-ink">
          {t.langSwitch}
        </button>
      </header>
      <main className={`flex-1 px-4 pt-2 ${bar ? 'pb-36' : 'pb-10'}`}>{children}</main>
      {bar && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 backdrop-blur">
          <div className="mx-auto max-w-md px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{bar}</div>
        </div>
      )}
    </div>
  )
}

export function Drop({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2.5s7 7.6 7 12.2a7 7 0 1 1-14 0C5 10.1 12 2.5 12 2.5Z" fill="#C8102E" />
    </svg>
  )
}

type Tone = 'ink' | 'blood' | 'quiet' | 'safe'
const tones: Record<Tone, string> = {
  ink: 'bg-ink text-white hover:bg-[#2A2F55] disabled:bg-muted/40',
  blood: 'bg-blood text-white hover:bg-[#B00E28] disabled:bg-blood/40',
  safe: 'bg-safe text-white hover:bg-[#0B6A3F] disabled:bg-safe/40',
  quiet: 'bg-card text-ink border border-line hover:bg-paper disabled:text-muted',
}

export function Button({ tone = 'ink', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      {...props}
      className={`flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl px-5 text-lg font-bold transition active:scale-[.98] disabled:cursor-not-allowed ${tones[tone]} ${className}`}
    />
  )
}

export function LinkButton({ tone = 'ink', className = '', ...props }: { tone?: Tone; className?: string; href: string; children: ReactNode }) {
  return (
    <a
      {...props}
      target={props.href.startsWith('http') ? '_blank' : undefined}
      rel="noreferrer"
      className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 font-bold no-underline ${tones[tone]} ${className}`}
    />
  )
}

export function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useT()
  return (
    <button onClick={onClick} className="-ml-2 mb-2 flex min-h-11 items-center gap-1 rounded-lg px-2 font-bold text-muted hover:text-ink">
      <ChevronLeft className="h-5 w-5" aria-hidden />{t.back}
    </button>
  )
}

/** Primary call to action with the other language underneath. */
export function BilingualLink({ to, main, sub, tone = 'blood', className = '' }: { to: string; main: string; sub: string; tone?: 'blood' | 'outline'; className?: string }) {
  const cls = tone === 'blood' ? 'bg-blood text-white hover:bg-[#B00E28]' : 'border-2 border-ink bg-card text-ink hover:bg-paper'
  return (
    <Link to={to} className={`flex min-h-15 flex-col items-center justify-center rounded-2xl px-8 py-2 no-underline transition-colors ${cls} ${className}`}>
      <span className="text-xl font-bold leading-tight">{main}</span>
      <span className={`text-sm leading-tight ${tone === 'blood' ? 'text-white/80' : 'text-muted'}`}>{sub}</span>
    </Link>
  )
}

export function Steps({ step, total }: { step: number; total: number }) {
  const { t } = useT()
  return (
    <div className="mb-5" aria-label={t.stepOf(step, total)}>
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-blood' : 'bg-line'}`} />
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">{t.stepOf(step, total)}</p>
    </div>
  )
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="display text-[2.1rem] text-ink">{children}</h1>
      {sub && <p className="mt-2 text-muted">{sub}</p>}
    </div>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 font-bold text-ink">{children}</p>
}

/** The blood group, set like the label on a blood bag. */
export function BloodLabel({ group, component, size = 'lg' }: { group: BloodGroup; component?: Component; size?: 'md' | 'lg' }) {
  const { t } = useT()
  const big = size === 'lg'
  return (
    <div className={`inline-flex flex-col border-[3px] border-ink bg-card ${big ? 'min-w-28' : 'min-w-20'}`}>
      {component && (
        <span className={`border-b-[3px] border-ink px-2 font-bold ${big ? 'py-0.5 text-sm' : 'text-xs'}`}>
          {t[component]}
        </span>
      )}
      <span className={`display px-2 text-blood ${big ? 'py-1 text-6xl' : 'py-0.5 text-4xl'}`}>{group}</span>
    </div>
  )
}

export function Choice({ selected, onClick, children, className = '' }: { selected: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-xl border-2 px-3 py-2.5 font-bold transition ${selected ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink'} ${className}`}
    >
      {children}
    </button>
  )
}

export function Notice({ tone = 'quiet', children }: { tone?: 'quiet' | 'safe' | 'blood'; children: ReactNode }) {
  const cls = { quiet: 'bg-card border-line text-muted', safe: 'bg-safe-soft border-safe/30 text-safe', blood: 'bg-blood-soft border-blood/30 text-blood' }[tone]
  return <div className={`rounded-xl border px-3.5 py-3 text-[0.95rem] ${cls}`}>{children}</div>
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p role="alert" className="mt-3 font-medium text-blood">{children}</p> : null
}
