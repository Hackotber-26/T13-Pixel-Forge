import { LocateFixed } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from './api'
import { useT } from './i18n'
import { Button } from './ui'

interface Place { name: string; lat: number; lng: number }

/** City box + "Near me". Navigates to /banks?lat=..&lng=..&place=.. */
export function BankFinder({ initial = '' }: { initial?: string }) {
  const { t } = useT()
  const nav = useNavigate()
  const [q, setQ] = useState(initial)
  const [error, setError] = useState('')
  const [locating, setLocating] = useState(false)

  useEffect(() => setQ(initial), [initial])

  const go = (p: Place) => nav(`/banks?lat=${p.lat}&lng=${p.lng}&place=${encodeURIComponent(p.name)}`)

  const search = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (q.trim().length < 2) return
    const places = await api<Place[]>(`/places?q=${encodeURIComponent(q.trim())}`).catch(() => [])
    if (places.length) go(places[0])
    else setError(t.banksNone)
  }

  const nearMe = () => {
    setLocating(true)
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setLocating(false); go({ name: '', lat: pos.coords.latitude, lng: pos.coords.longitude }) },
      () => { setLocating(false); setError(t.locDenied) },
      { timeout: 10000 },
    )
  }

  return (
    <div>
      <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.cityPlaceholder} aria-label={t.cityPlaceholder}
          className="min-h-13 flex-1 rounded-2xl border-2 border-line bg-card px-4 text-lg outline-none focus:border-ink"
        />
        <div className="flex gap-2">
          <Button type="submit" className="sm:w-auto">{t.search}</Button>
          <Button type="button" tone="quiet" onClick={nearMe} disabled={locating} className="sm:w-auto"><LocateFixed className={`h-5 w-5 ${locating ? 'animate-spin' : ''}`} aria-hidden />{locating ? t.locating : t.nearMe}</Button>
        </div>
      </form>
      {error && <p className="mt-2 font-medium text-blood">{error}</p>}
    </div>
  )
}
