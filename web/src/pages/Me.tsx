import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type Me as MeData } from '../api'
import { useT } from '../i18n'
import { PinPicker, type Point } from '../maps'
import { BloodLabel, Button, Notice, Shell, Title } from '../ui'
import { VerifyWhatsApp } from '../VerifyWhatsApp'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function Me() {
  const { t } = useT()
  const [me, setMe] = useState<MeData | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [moving, setMoving] = useState(false)
  const [point, setPoint] = useState<Point | null>(null)
  const [area, setArea] = useState<string | null>(null)

  const load = () => api<MeData>('/me').then(setMe, (e) => { if (e instanceof ApiError && e.status === 401) setSignedOut(true) })
  useEffect(() => { load() }, [])

  const patch = async (body: object) => setMe(await api<MeData>('/me', { method: 'PATCH', body }))

  if (signedOut) {
    return (
      <Shell>
        <Title sub={t.signedOut}>{t.meTitle}</Title>
        <VerifyWhatsApp onVerified={() => { setSignedOut(false); load() }} />
      </Shell>
    )
  }
  if (!me) return <Shell>{null}</Shell>
  const d = me.donor
  const pausedUntil = d?.snooze_until && new Date(d.snooze_until) > new Date() ? d.snooze_until : null
  const available = !!d?.open_to_donate && !pausedUntil

  return (
    <Shell>
      <Title>{t.meTitle}</Title>
      {d ? (
        <>
          <div className="flex items-center gap-4">
            <BloodLabel group={d.blood_group} />
            <div>
              <p className="display text-3xl">{d.name}</p>
              <p className="text-muted">+{me.phone}</p>
            </div>
          </div>

          <button
            onClick={() => patch({ open_to_donate: !available })}
            role="switch" aria-checked={available}
            className={`mt-6 flex w-full items-center justify-between rounded-2xl border-2 p-4 text-left ${available ? 'border-safe bg-safe-soft' : 'border-line bg-card'}`}
          >
            <span>
              <span className="block text-lg font-bold">{t.openToDonate}</span>
              <span className="block text-sm text-muted">{pausedUntil ? t.pausedUntil(fmtDate(pausedUntil)) : available ? t.openOn : t.openOff}</span>
            </span>
            <span className={`relative h-8 w-14 shrink-0 rounded-full transition ${available ? 'bg-safe' : 'bg-line'}`}>
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${available ? 'left-7' : 'left-1'}`} />
            </span>
          </button>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="display text-4xl">{d.donations_count}</p>
              <p className="text-sm text-muted">{t.donations}</p>
            </div>
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="display text-2xl">{d.last_donated_at ? fmtDate(d.last_donated_at) : t.never}</p>
              <p className="text-sm text-muted">{t.lastDonated}</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <Button tone="quiet" onClick={async () => setMe(await api<MeData>('/me/donated', { method: 'POST' }))}>{t.iDonated}</Button>
            {moving ? (
              <div className="space-y-2 rounded-2xl border border-line bg-card p-3">
                <PinPicker value={point ?? { lat: d.lat, lng: d.lng }} onChange={setPoint} onLabel={setArea} />
                <Button disabled={!point} onClick={async () => { await patch({ location: { ...point, label: area ?? undefined } }); setMoving(false) }}>{t.updateLocation}</Button>
              </div>
            ) : (
              <Button tone="quiet" onClick={() => setMoving(true)}>{t.updateLocation}</Button>
            )}
          </div>

          {me.history.length > 0 && (
            <section className="mt-8">
              <h2 className="display mb-3 text-2xl">{t.history}</h2>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                {me.history.map((h, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <span className="block font-bold">{h.blood_group}, {h.hospital_name}</span>
                      <span className="block text-sm text-muted">{fmtDate(h.alerted_at)}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold">{t[`status_${h.status}` as keyof typeof t] as string}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <Notice>{t.notDonor}</Notice>
          <Link to="/join" className="mt-4 flex min-h-13 items-center justify-center rounded-2xl bg-ink text-lg font-bold text-white no-underline">{t.becomeDonor}</Link>
        </>
      )}

      {me.my_requests.length > 0 && (
        <section className="mt-8">
          <h2 className="display mb-3 text-2xl">{t.myRequests}</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {me.my_requests.map((r) => (
              <li key={r.public_token}>
                <Link to={`/r/${r.public_token}`} className="flex items-center justify-between gap-3 px-4 py-3 text-ink no-underline">
                  <span>
                    <span className="block font-bold">{r.blood_group}, {r.hospital_name}</span>
                    <span className="block text-sm text-muted">{fmtDate(r.created_at)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold">{t[`status_${r.status}` as keyof typeof t] as string}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d && (
        <button
          onClick={async () => { if (window.confirm(t.deleteConfirm)) { await api('/me', { method: 'DELETE' }); load() } }}
          className="mt-10 text-sm text-muted underline"
        >
          {t.deleteMe}
        </button>
      )}
    </Shell>
  )
}
