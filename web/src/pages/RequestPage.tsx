import { BadgeCheck, CircleHelp, Navigation, Phone, Share2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, directionsUrl, type RequestView } from '../api'
import { BankCard } from '../BankCard'
import { useT } from '../i18n'
import { InteractiveMap, type MapPoint } from '../maps'
import { BloodLabel, Button, ErrorText, LinkButton, Notice, Shell } from '../ui'
import { WaIcon } from '../VerifyWhatsApp'

export default function RequestPage() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const { t } = useT()
  const [req, setReq] = useState<RequestView | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api<RequestView>(`/r/${token}`).then(setReq, (e) => setError(e.message))
  }, [token])
  useEffect(() => {
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [load])

  if (!req && error) {
    return (
      <Shell>
        <h1 className="display mt-6 text-[2rem]">{error}</h1>
        <p className="mt-2 text-muted">{t.linkExpired}</p>
        <Link to="/" className="mt-6 flex min-h-13 items-center justify-center rounded-2xl bg-ink text-lg font-bold text-white no-underline hover:bg-[#2A2F55]">{t.appName}</Link>
      </Shell>
    )
  }
  if (!req) {
    return (
      <Shell>
        <div className="flex animate-pulse gap-4"><div className="h-28 w-28 bg-line" /><div className="mt-2 h-6 w-32 rounded bg-line" /></div>
        <div className="mt-6 h-8 w-3/4 animate-pulse rounded bg-line" />
        <div className="mt-8 h-64 animate-pulse rounded-2xl bg-line" />
      </Shell>
    )
  }

  if (params.get('checkin') && req.role === 'donor') return <Checkin token={token!} />
  if (req.role === 'requester') return <RequesterView req={req} reload={load} />
  if (req.role === 'donor') return <DonorView req={req} onChange={setReq} />

  return (
    <Shell bar={<Link to="/join" className="flex min-h-13 items-center justify-center rounded-2xl bg-ink text-lg font-bold text-white no-underline">{t.becomeDonor}</Link>}>
      <Need req={req} />
      <Banks req={req} />
    </Shell>
  )
}

function Need({ req, distance }: { req: RequestView; distance?: number }) {
  const { t } = useT()
  return (
    <section>
      <div className="flex items-start gap-4">
        <BloodLabel group={req.blood_group} component={req.component} />
        <div className="pt-1">
          <p className="display text-2xl">{t.unitCount(req.units)}</p>
          <p className="font-bold">{t[req.urgency]}</p>
          {req.ailment && <p className="mt-1 font-bold text-blood">{t[req.ailment]}</p>}
        </div>
      </div>
      <h1 className="display mt-5 text-[2rem]">{req.hospital_name}</h1>
      <p className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold ${req.hospital_verified ? 'text-safe' : 'text-muted'}`}>
        <span className="flex items-center gap-1">
          {req.hospital_verified ? <BadgeCheck className="h-4 w-4" aria-hidden /> : <CircleHelp className="h-4 w-4" aria-hidden />}
          {req.hospital_verified ? t.verifiedHospital : t.unverifiedHospital}
        </span>
        {distance != null && <span className="font-normal text-muted">{t.fromYou(distance)}</span>}
      </p>
      {req.note && <p className="mt-3 rounded-xl bg-card px-3.5 py-3 text-ink">“{req.note}”</p>}
    </section>
  )
}

/** Hospital, the donor-search ring (while it's live) and numbered blood banks, linked to the cards below. */
function Banks({ req, ring = false }: { req: RequestView; ring?: boolean }) {
  const { t } = useT()
  const [active, setActive] = useState<string | null>(null)
  const cards = useRef<Record<string, HTMLLIElement | null>>({})
  const points: MapPoint[] = useMemo(
    () => req.banks.map((b, i) => ({ id: String(i), name: b.name, sub: t.kmAway(b.distance_km), lat: b.lat, lng: b.lng })),
    [req.banks, t],
  )
  const showRing = ring && req.status === 'active' && req.searching
  return (
    <section className="mt-8">
      <h2 className="display mb-3 text-2xl">{t.banksTitle}</h2>
      <InteractiveMap
        center={{ lat: req.lat, lng: req.lng }} centerLabel={req.hospital_name}
        points={points} activeId={active} radiusKm={showRing ? req.radius_km : undefined}
        onSelect={(id) => { setActive(id); cards.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }}
      />
      <p className="mt-2 text-sm text-muted">
        {showRing && <span className="font-bold text-blood">{t.ringLabel(req.radius_km)}. </span>}
        {req.banks.length > 0 ? t.mapHint : t.banksEmpty}
      </p>
      <ul className="mt-3 space-y-2">
        {req.banks.map((b, i) => (
          <li key={b.name + b.lat} ref={(el) => { cards.current[String(i)] = el }}>
            <BankCard bank={b} n={i + 1} active={active === String(i)} onFocus={() => setActive(String(i))} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function RequesterView({ req, reload }: { req: RequestView; reload: () => void }) {
  const { t } = useT()
  const [confirming, setConfirming] = useState(false)
  const active = req.status === 'active'
  const shareUrl = `${window.location.origin}/r/${req.token}`
  const shareText = t.shareText(`${req.blood_group} ${t[req.component]}`, req.hospital_name)

  const close = async () => {
    await api(`/r/${req.token}/close`, { body: { found: true } })
    setConfirming(false); reload()
  }
  const share = () => {
    if (navigator.share) navigator.share({ text: shareText, url: shareUrl }).catch(() => {})
    else window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, '_blank')
  }

  const bar = active ? (
    confirming ? (
      <div className="space-y-2">
        <p className="text-sm">{t.closeConfirm}</p>
        <div className="flex gap-2">
          <Button tone="quiet" onClick={() => setConfirming(false)}>{t.cancel}</Button>
          <Button tone="safe" onClick={close}>{t.closeRequest}</Button>
        </div>
      </div>
    ) : <Button tone="safe" onClick={() => setConfirming(true)}>{t.foundBlood}</Button>
  ) : undefined

  return (
    <Shell bar={bar}>
      <Need req={req} />

      <section className="mt-6 rounded-2xl border border-line bg-card p-4">
        {active && req.searching ? (
          <div className="flex items-center gap-3">
            <span className="pulse h-3 w-3 shrink-0 rounded-full bg-blood" />
            <p className="font-bold">{t.searchingWithin(req.radius_km)}</p>
          </div>
        ) : active ? (
          <p className="font-medium text-muted">{req.counts.alerted === 0 ? t.noDonorsNearby : t.searchPaused}</p>
        ) : (
          <p className="font-medium">{req.status === 'paused' ? t.statusPaused : t.statusClosed}</p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            [req.counts.alerted, t.alertedCount(req.counts.alerted)],
            [req.counts.viewed, t.seenCount(req.counts.viewed)],
            [req.counts.coming, t.comingCount(req.counts.coming)],
          ].map(([n, label], i) => (
            <div key={i} className={`rounded-xl py-2 ${i === 2 && req.counts.coming ? 'bg-safe-soft text-safe' : 'bg-paper'}`}>
              <p className="display text-3xl">{n}</p>
              <p className="text-xs leading-tight">{String(label).replace(/^\d+\s*/, '')}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="display mb-3 text-2xl">{t.donorsComing}</h2>
        {req.donors?.length ? (
          <ul className="space-y-2">
            {req.donors.map((d) => (
              <li key={d.phone} className="rounded-2xl border border-safe/40 bg-card p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold">{d.name}</p>
                  <span className="display text-2xl text-blood">{d.blood_group}</span>
                </div>
                <p className="text-sm text-muted">{t.kmAway(d.distance_km)}</p>
                <div className="mt-2.5 flex gap-2">
                  <LinkButton tone="ink" className="flex-1" href={`tel:+${d.phone}`}><Phone className="h-4 w-4" aria-hidden />{t.call}</LinkButton>
                  <LinkButton tone="safe" className="flex-1" href={`https://wa.me/${d.phone}`}><WaIcon />{t.whatsapp}</LinkButton>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-muted">{t.noDonorsYet}</p>}
      </section>

      <Banks req={req} ring />

      {active && (
        <Button tone="quiet" onClick={share} className="mt-8"><Share2 className="h-5 w-5" aria-hidden />{t.share}</Button>
      )}
    </Shell>
  )
}

function DonorView({ req, onChange }: { req: RequestView; onChange: (r: RequestView) => void }) {
  const { t } = useT()
  const [confirming, setConfirming] = useState(false)
  const [paused, setPaused] = useState(false)
  const [reported, setReported] = useState(false)
  const [error, setError] = useState('')
  const status = req.my_match!.status
  const open = req.status === 'active' && (status === 'alerted' || status === 'viewed')

  const respond = async (action: 'accept' | 'decline', pause_days?: number) => {
    setError('')
    try {
      onChange(await api<RequestView>(`/r/${req.token}/respond`, { body: { action, pause_days } }))
      setConfirming(false)
    } catch (e) { setError((e as Error).message) }
  }
  const report = async () => {
    if (!window.confirm(t.reportConfirm)) return
    await api(`/r/${req.token}/report`, { body: {} }); setReported(true)
  }

  const bar = open ? (
    confirming ? (
      <div className="space-y-2">
        <p className="font-bold">{t.confirmTitle}</p>
        <p className="text-sm text-muted">{t.confirmSub}</p>
        <div className="flex gap-2">
          <Button tone="quiet" onClick={() => setConfirming(false)}>{t.cancel}</Button>
          <Button tone="blood" onClick={() => respond('accept')}>{t.confirm}</Button>
        </div>
      </div>
    ) : (
      <div className="space-y-2">
        <Button tone="blood" onClick={() => setConfirming(true)}>{t.canDonate}</Button>
        <Button tone="quiet" onClick={() => respond('decline')}>{t.cantDonate}</Button>
      </div>
    )
  ) : undefined

  return (
    <Shell bar={bar}>
      {open && <p className="display mb-4 text-xl text-blood">{t.donorAsk}</p>}
      <Need req={req} distance={req.my_match!.distance_km} />
      <div className="mt-4"><InteractiveMap center={{ lat: req.lat, lng: req.lng }} centerLabel={req.hospital_name} height="h-52" /></div>

      <div className="mt-4 space-y-3">
        {(status === 'accepted' || status === 'donated') && (
          <>
            <Notice tone="safe">{t.thanksComing}</Notice>
            {req.requester_phone && (
              <div className="rounded-2xl border border-line bg-card p-3.5">
                <p className="font-bold">{t.familyContact}</p>
                <div className="mt-2.5 flex gap-2">
                  <LinkButton tone="ink" className="flex-1" href={`tel:+${req.requester_phone}`}><Phone className="h-4 w-4" aria-hidden />{t.call}</LinkButton>
                  <LinkButton tone="safe" className="flex-1" href={`https://wa.me/${req.requester_phone}`}><WaIcon />{t.whatsapp}</LinkButton>
                </div>
              </div>
            )}
            <LinkButton tone="quiet" href={directionsUrl(req.lat, req.lng)}><Navigation className="h-4 w-4" aria-hidden />{t.directions}</LinkButton>
          </>
        )}
        {status === 'declined' && (
          <>
            <Notice>{t.declinedThanks}</Notice>
            {!paused && (
              <Button tone="quiet" onClick={async () => { await api('/me', { method: 'PATCH', body: { pause_days: 7 } }); setPaused(true) }}>
                {t.pause}
              </Button>
            )}
          </>
        )}
        {!open && status !== 'accepted' && status !== 'declined' && status !== 'donated' && <Notice>{t.coveredAlready}</Notice>}
        <Notice tone="blood">{t.safetyDonor}</Notice>
        <ErrorText>{error}</ErrorText>
        {reported ? <p className="text-sm text-muted">{t.reported}</p> : (
          <button onClick={report} className="text-sm text-muted underline">{t.report}</button>
        )}
      </div>
    </Shell>
  )
}

function Checkin({ token }: { token: string }) {
  const { t } = useT()
  const [done, setDone] = useState<boolean | null>(null)
  const send = async (donated: boolean) => {
    await api(`/r/${token}/checkin`, { body: { donated } }); setDone(donated)
  }
  return (
    <Shell>
      {done === null ? (
        <>
          <h1 className="display mb-6 text-[2.1rem]">{t.checkinTitle}</h1>
          <div className="space-y-3">
            <Button tone="safe" onClick={() => send(true)}>{t.checkinYes}</Button>
            <Button tone="quiet" onClick={() => send(false)}>{t.checkinNo}</Button>
          </div>
        </>
      ) : (
        <>
          <h1 className="display mb-4 text-[2.1rem]">{done ? t.checkinThanks : t.declinedThanks}</h1>
          <Link to="/me" className="font-bold text-ink">{t.myRaksha}</Link>
        </>
      )}
    </Shell>
  )
}
