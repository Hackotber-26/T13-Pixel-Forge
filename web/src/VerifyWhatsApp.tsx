import { useEffect, useRef, useState } from 'react'
import { api, setSession } from './api'
import { useT } from './i18n'
import { Button, ErrorText } from './ui'

interface Start { id: string; secret: string; code: string; wa_link: string }

/** Reverse OTP: open WhatsApp with a code typed in; the user presses send; we poll until the webhook sees it. */
export function VerifyWhatsApp({ onVerified, label }: { onVerified: () => void; label?: string }) {
  const { t } = useT()
  const [pending, setPending] = useState<Start | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('raksha.verify') ?? 'null') } catch { return null }
  })
  const [error, setError] = useState('')
  const done = useRef(false)

  useEffect(() => {
    if (!pending) return
    let stop = false
    const check = async () => {
      if (stop || done.current) return
      try {
        const s = await api<{ verified: boolean; session?: string }>(
          `/auth/wa/status/${pending.id}?secret=${encodeURIComponent(pending.secret)}`)
        if (s.verified && s.session) {
          done.current = true
          setSession(s.session)
          try { sessionStorage.removeItem('raksha.verify') } catch { /* ignore */ }
          onVerified()
        }
      } catch {
        try { sessionStorage.removeItem('raksha.verify') } catch { /* ignore */ }
        setPending(null)
      }
    }
    check()
    const timer = setInterval(check, 2000)
    document.addEventListener('visibilitychange', check)
    return () => { stop = true; clearInterval(timer); document.removeEventListener('visibilitychange', check) }
  }, [pending, onVerified])

  const start = async () => {
    setError('')
    try {
      const s = await api<Start>('/auth/wa/start', { method: 'POST' })
      try { sessionStorage.setItem('raksha.verify', JSON.stringify(s)) } catch { /* ignore */ }
      setPending(s)
      window.location.href = s.wa_link
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (pending) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
          <span className="pulse h-3 w-3 shrink-0 rounded-full bg-blood" />
          <p className="font-medium">{t.verifyWaiting}</p>
        </div>
        <Button tone="quiet" onClick={() => { window.location.href = pending.wa_link }}>{t.verifyOpenAgain}</Button>
      </div>
    )
  }
  return (
    <div>
      <Button tone="safe" onClick={start}><WaIcon />{label ?? t.verifyBtn}</Button>
      <p className="mt-3 text-sm text-muted">{t.verifyHow}</p>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

export function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.2-.7-2.7-1.1-4.4-3.9-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-2 1-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z" />
    </svg>
  )
}
