import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type Bank } from '../api'
import { BankFinder } from '../BankFinder'
import { BankCard } from '../BankCard'
import { useT } from '../i18n'
import { InteractiveMap, type MapPoint } from '../maps'
import { SiteShell } from '../site'

export default function Banks() {
  const { t } = useT()
  const [params] = useSearchParams()
  const lat = Number(params.get('lat')), lng = Number(params.get('lng'))
  const place = params.get('place') ?? ''
  const hasPoint = !!params.get('lat') && !!params.get('lng')
  const [banks, setBanks] = useState<Bank[] | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const cards = useRef<Record<string, HTMLLIElement | null>>({})

  useEffect(() => {
    setActive(null)
    if (!hasPoint) { setBanks(null); return }
    setBanks(null)
    api<Bank[]>(`/banks?lat=${lat}&lng=${lng}`).then(setBanks, () => setBanks([]))
  }, [hasPoint, lat, lng])

  const points: MapPoint[] = useMemo(
    () => (banks ?? []).map((b, i) => ({ id: String(i), name: b.name, sub: t.kmAway(b.distance_km), lat: b.lat, lng: b.lng })),
    [banks, t],
  )

  // Tapping a number on the map brings its card into view.
  const selectFromMap = (id: string) => {
    setActive(id)
    cards.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 pt-10 md:px-6">
        <h1 className="display text-[2.4rem] md:text-[3rem]">{t.banksPageTitle}{place && `: ${place}`}</h1>
        <p className="mt-2 text-lg text-muted">{t.banksPageSub}</p>
        <div className="mt-6 max-w-3xl"><BankFinder initial={place} /></div>

        {!hasPoint && <p className="mt-10 text-muted">{t.banksPick}</p>}
        {hasPoint && banks === null && <div className="mt-8 h-72 animate-pulse rounded-2xl bg-line/60" />}
        {banks && banks.length === 0 && <p className="mt-10 font-medium">{t.banksNone}</p>}
        {banks && banks.length > 0 && (
          <div className="mt-8 grid gap-6 md:grid-cols-[1.1fr_1fr]">
            <div className="md:sticky md:top-24 md:self-start">
              <InteractiveMap
                center={{ lat, lng }} centerLabel={place || undefined} centerIsHospital={false}
                points={points} activeId={active} onSelect={selectFromMap} height="h-80 md:h-[34rem]"
              />
              <p className="mt-2 text-sm text-muted">{t.bankCount(banks.length)}. {t.mapHint}</p>
            </div>
            <ul className="space-y-3">
              {banks.map((b, i) => (
                <li key={b.name + b.lat} ref={(el) => { cards.current[String(i)] = el }}>
                  <BankCard bank={b} n={i + 1} active={active === String(i)} onFocus={() => setActive(String(i))} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SiteShell>
  )
}
