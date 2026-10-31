import L from 'leaflet'
import { LocateFixed, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { api } from './api'
import { useT } from './i18n'

export interface Point { lat: number; lng: number }
export interface MapPoint extends Point { id: string; name: string; sub?: string }

const INDIA: Point = { lat: 22.5, lng: 79 }
// Standard OSM tiles (no key needed), softened in CSS so red markers stand out.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const svgDrop = (fill: string) =>
  `<svg viewBox="0 0 24 24" width="34" height="40"><path d="M12 2.5s7 7.6 7 12.2a7 7 0 1 1-14 0C5 10.1 12 2.5 12 2.5Z" fill="${fill}" stroke="#fff" stroke-width="1.6"/></svg>`

const hospitalIcon = L.divIcon({
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  html: `<div class="map-hospital"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg></div>`,
})

const numberIcon = (n: number, active: boolean) =>
  L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div class="map-num${active ? ' is-active' : ''}">${n}</div>`,
  })

function useAreaLabel(point: Point | null) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    if (!point) return
    const timer = setTimeout(() => {
      api<{ label: string | null }>(`/places/near?lat=${point.lat}&lng=${point.lng}`).then((r) => setLabel(r.label), () => {})
    }, 350)
    return () => clearTimeout(timer)
  }, [point?.lat, point?.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  return label
}

/** Scroll-wheel zoom only once the map has been clicked, so it never hijacks page scrolling. */
function WheelOnFocus() {
  const map = useMap()
  useEffect(() => {
    map.scrollWheelZoom.disable()
    const on = () => map.scrollWheelZoom.enable()
    const off = () => map.scrollWheelZoom.disable()
    map.on('click focus', on)
    map.on('mouseout blur', off)
    return () => { map.off('click focus', on); map.off('mouseout blur', off) }
  }, [map])
  return null
}

function FlyTo({ to, zoom }: { to: Point | null; zoom: number }) {
  const map = useMap()
  useEffect(() => { if (to) map.flyTo([to.lat, to.lng], Math.max(map.getZoom(), zoom), { duration: 0.6 }) }, [map, to, zoom])
  return null
}

function TrackCentre({ onMove, onDragging }: { onMove: (p: Point) => void; onDragging: (d: boolean) => void }) {
  useMapEvents({
    movestart: () => onDragging(true),
    moveend: (e) => {
      onDragging(false)
      const c = e.target.getCenter()
      onMove({ lat: c.lat, lng: c.lng })
    },
  })
  return null
}

/**
 * Location picker in the style Indian delivery apps use: the pin stays in the middle,
 * people move the map under it. One-tap "use my location", plus search for a town.
 */
export function PinPicker({ value, onChange, onLabel }: { value: Point | null; onChange: (p: Point) => void; onLabel?: (label: string | null) => void }) {
  const { t } = useT()
  const [dragging, setDragging] = useState(false)
  const [state, setState] = useState<'idle' | 'locating' | 'denied'>('idle')
  const [jump, setJump] = useState<Point | null>(null)
  const [q, setQ] = useState('')
  const [places, setPlaces] = useState<(Point & { name: string })[]>([])
  const label = useAreaLabel(value)
  useEffect(() => { onLabel?.(label) }, [label]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (q.trim().length < 2) { setPlaces([]); return }
    const timer = setTimeout(() => {
      api<(Point & { name: string })[]>(`/places?q=${encodeURIComponent(q.trim())}`).then(setPlaces, () => setPlaces([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [q])

  const locate = () => {
    if (!navigator.geolocation) { setState('denied'); return }
    setState('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState('idle')
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setJump(p); onChange(p)
      },
      () => setState('denied'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchArea} aria-label={t.searchArea}
          className="w-full rounded-xl border-2 border-line bg-card py-3 pr-4 pl-11 outline-none focus:border-ink"
        />
        {places.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-[600] mt-1 overflow-hidden rounded-xl border border-line bg-card shadow-lg">
            {places.map((p) => (
              <li key={p.name + p.lat}>
                <button
                  type="button"
                  onClick={() => { setJump(p); onChange(p); setQ(''); setPlaces([]) }}
                  className="block w-full cursor-pointer px-4 py-3 text-left font-medium hover:bg-paper"
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative h-72 overflow-hidden rounded-2xl border border-line">
        <MapContainer center={[value?.lat ?? INDIA.lat, value?.lng ?? INDIA.lng]} zoom={value ? 15 : 5} className="h-full w-full" zoomControl={false}>
          <TileLayer url={TILES} attribution={ATTRIBUTION} />
          <WheelOnFocus />
          <TrackCentre onMove={onChange} onDragging={setDragging} />
          <FlyTo to={jump} zoom={15} />
        </MapContainer>
        {/* Fixed centre pin: lifts while the map moves */}
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <div className={`-mt-10 transition-transform duration-150 ${dragging ? '-translate-y-2' : ''}`} dangerouslySetInnerHTML={{ __html: svgDrop('#C8102E') }} />
          <span className={`absolute h-2 w-2 rounded-full bg-ink/40 transition-opacity ${dragging ? 'opacity-100' : 'opacity-0'}`} />
        </div>
        <button
          type="button" onClick={locate} disabled={state === 'locating'}
          className="absolute right-3 bottom-3 z-[500] flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-card px-4 font-bold shadow-md ring-1 ring-line hover:bg-paper disabled:opacity-70"
        >
          <LocateFixed className={`h-5 w-5 ${state === 'locating' ? 'animate-spin' : ''}`} aria-hidden />
          {state === 'locating' ? t.locating : t.useLocationShort}
        </button>
      </div>
      <p className="min-h-6 text-sm" aria-live="polite">
        {state === 'denied' ? <span className="font-medium text-blood">{t.locDenied}</span>
          : value && label ? <span><span className="text-muted">{t.pinAt} </span><span className="font-bold">{label}</span></span>
          : <span className="text-muted">{t.tapMap}</span>}
      </p>
    </div>
  )
}

/**
 * Read-mostly map: a hospital (or searched place) in the middle, numbered points around it
 * that stay in sync with a list (tap a number, the card highlights, and the other way round),
 * and an optional dashed ring showing how far the donor search has reached.
 */
export function InteractiveMap({
  center, centerLabel, points = [], activeId, onSelect, radiusKm, height = 'h-64', centerIsHospital = true,
}: {
  center: Point
  centerLabel?: string
  points?: MapPoint[]
  activeId?: string | null
  onSelect?: (id: string) => void
  radiusKm?: number
  height?: string
  centerIsHospital?: boolean
}) {
  const active = points.find((p) => p.id === activeId) ?? null
  return (
    <div className={`${height} relative overflow-hidden rounded-2xl border border-line`}>
      <MapContainer center={[center.lat, center.lng]} zoom={13} className="h-full w-full">
        <TileLayer url={TILES} attribution={ATTRIBUTION} />
        <WheelOnFocus />
        <FitOnce center={center} points={points} radiusKm={radiusKm} />
        <FlyTo to={active} zoom={14} />
        {radiusKm && (
          <Circle
            center={[center.lat, center.lng]} radius={radiusKm * 1000}
            pathOptions={{ color: '#C8102E', weight: 2, dashArray: '6 8', fillColor: '#C8102E', fillOpacity: 0.05, className: 'radius-ring' }}
          />
        )}
        {points.map((p, i) => (
          <Marker
            key={p.id} position={[p.lat, p.lng]} icon={numberIcon(i + 1, p.id === activeId)}
            zIndexOffset={p.id === activeId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect?.(p.id) }}
          >
            <Popup><strong>{p.name}</strong>{p.sub && <><br />{p.sub}</>}</Popup>
          </Marker>
        ))}
        <Marker position={[center.lat, center.lng]} icon={centerIsHospital ? hospitalIcon : L.divIcon({ className: '', iconSize: [34, 40], iconAnchor: [17, 38], html: svgDrop('#C8102E') })}>
          {centerLabel && <Popup><strong>{centerLabel}</strong></Popup>}
        </Marker>
      </MapContainer>
    </div>
  )
}

/** Fit hospital + points (+ ring) when the set of points changes; not on every poll. */
function FitOnce({ center, points, radiusKm }: { center: Point; points: Point[]; radiusKm?: number }) {
  const map = useMap()
  const key = useMemo(() => `${center.lat},${center.lng},${radiusKm}|${points.map((p) => `${p.lat},${p.lng}`).join(';')}`, [center, points, radiusKm])
  const last = useRef('')
  useEffect(() => {
    if (key === last.current) return
    last.current = key
    const bounds = L.latLngBounds([[center.lat, center.lng]])
    points.forEach((p) => bounds.extend([p.lat, p.lng]))
    if (radiusKm) bounds.extend(L.latLng(center.lat, center.lng).toBounds(radiusKm * 2000))
    if (points.length || radiusKm) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 })
    else map.setView([center.lat, center.lng], 14)
  }, [map, key, center, points, radiusKm])
  return null
}
