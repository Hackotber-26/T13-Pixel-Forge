import { Building2, LocateFixed, MapPin, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Hospital } from './api'
import { useT } from './i18n'

type Near = { lat: number; lng: number }

/** Type-ahead over our hospital directory. With the user's location, nearby hospitals rank first. */
export function HospitalSearch({ value, onPick, onNotFound }: {
  value: Hospital | null
  onPick: (h: Hospital | null) => void
  onNotFound: () => void
}) {
  const { t } = useT()
  const [q, setQ] = useState(value?.name ?? '')
  const [results, setResults] = useState<Hospital[]>([])
  const [loading, setLoading] = useState(false)
  const [near, setNear] = useState<Near | null>(null)
  const [locating, setLocating] = useState(false)

  const locate = () => {
    setLocating(true)
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setLocating(false); setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude }) },
      () => setLocating(false),
      { timeout: 10000 },
    )
  }

  // Use the location silently if the browser already allows it.
  useEffect(() => {
    navigator.permissions?.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') locate() }).catch(() => {})
  }, [])

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      const params = new URLSearchParams({ q: q.trim() })
      if (near) { params.set('lat', String(near.lat)); params.set('lng', String(near.lng)) }
      try { setResults(await api<Hospital[]>(`/hospitals?${params}`)) } catch { setResults([]) }
      setLoading(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [q, near])

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); if (value) onPick(null) }}
          placeholder={t.hospitalPlaceholder}
          autoComplete="off"
          aria-label={t.hospital}
          className="w-full rounded-xl border-2 border-line bg-card py-3 pr-4 pl-11 text-lg outline-none focus:border-ink"
        />
      </div>
      {!near && (
        <button type="button" onClick={locate} disabled={locating} className="mt-2 flex min-h-10 items-center gap-1.5 rounded-full px-1 text-sm font-bold text-ink hover:underline">
          <LocateFixed className={`h-4 w-4 ${locating ? 'animate-spin' : ''}`} aria-hidden />{locating ? t.locating : t.nearbyFirst}
        </button>
      )}
      {q.trim().length >= 2 && (
        <ul className="mt-2 overflow-hidden rounded-xl border border-line bg-card">
          {loading && results.length === 0 && <li className="px-4 py-3 text-muted">…</li>}
          {results.map((h) => (
            <li key={h.id} className="border-b border-line last:border-0">
              <button
                type="button"
                onClick={() => { onPick(h); setQ(h.name); setResults([]) }}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-paper"
              >
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-bold leading-snug">{h.name}</span>
                  <span className="block text-sm text-muted">
                    {[h.address, h.city].filter(Boolean).join(', ')}
                    {h.distance_km != null && <span className="font-medium text-ink"> {t.fromYou(h.distance_km)}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!loading && (
            <li>
              <button type="button" onClick={onNotFound} className="flex w-full items-center gap-3 px-4 py-3 text-left font-bold text-blood hover:bg-blood-soft">
                <MapPin className="h-5 w-5" aria-hidden />{t.hospitalNotFound}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
