import { BadgeCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, BLOOD_GROUPS, type BloodGroup } from '../api'
import { useT } from '../i18n'
import { PinPicker, type Point } from '../maps'
import { BackButton, BloodLabel, Button, Choice, ErrorText, Label, Notice, Shell, Steps, Title } from '../ui'
import { useSignedIn } from '../useSignedIn'
import { clearStored, useStoredState } from '../useStoredState'
import { VerifyWhatsApp } from '../VerifyWhatsApp'

export default function Join() {
  const { t } = useT()
  const signedIn = useSignedIn()
  const [step, setStep] = useStoredState('raksha.join.step', 1)
  const [name, setName] = useStoredState('raksha.join.name', '')
  const [group, setGroup] = useStoredState<BloodGroup | null>('raksha.join.group', null)
  const [point, setPoint] = useStoredState<Point | null>('raksha.join.point', null)
  const [ready, setReady] = useStoredState('raksha.join.ready', false)
  const [consent, setConsent] = useState(true)
  const [area, setArea] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [step])

  const submit = async () => {
    setError(''); setSending(true)
    try {
      await api('/donors', {
        body: { name: name.trim(), blood_group: group, location: { ...point, label: area ?? undefined }, readiness_ok: ready, consent },
      })
      clearStored('raksha.join.')
      setJoined(true)
    } catch (e) { setError((e as Error).message) }
    setSending(false)
  }

  if (joined && group) {
    return (
      <Shell>
        <div className="pt-6">
          <BloodLabel group={group} />
          <h1 className="display mt-6 text-[2.4rem]">{t.joinedTitle}</h1>
          <p className="mt-3 text-lg text-muted">{t.joinedSub}</p>
          <Link to="/me" className="mt-8 flex min-h-13 items-center justify-center rounded-2xl bg-ink text-lg font-bold text-white no-underline">{t.myRaksha}</Link>
        </div>
      </Shell>
    )
  }

  const bar =
    step === 1 ? <Button disabled={name.trim().length < 2 || !group} onClick={() => setStep(2)}>{t.next}</Button>
    : step === 2 ? <Button disabled={!point} onClick={() => setStep(3)}>{t.next}</Button>
    : signedIn ? <Button tone="blood" disabled={!consent || sending} onClick={submit}>{t.join}</Button>
    : undefined

  return (
    <Shell bar={bar}>
      {step > 1 && <BackButton onClick={() => setStep(step - 1)} />}
      <Steps step={step} total={3} />

      {step === 1 && (
        <>
          <Title>{t.joinTitle1}</Title>
          <Label>{t.name}</Label>
          <input
            value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
            className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-lg outline-none focus:border-ink"
          />
          <div className="mt-6">
            <Label>{t.bloodGroup}</Label>
            <div className="grid grid-cols-4 gap-2">
              {BLOOD_GROUPS.map((g) => (
                <Choice key={g} selected={group === g} onClick={() => setGroup(g)} className="display py-3 text-2xl">{g}</Choice>
              ))}
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Title sub={t.joinLocSub}>{t.joinTitle2}</Title>
          <PinPicker value={point} onChange={setPoint} onLabel={setArea} />
        </>
      )}

      {step === 3 && (
        <>
          <Title sub={t.readinessSub}>{t.joinTitle3}</Title>
          <ul className="mb-4 space-y-1.5 rounded-2xl border border-line bg-card p-4">
            {[t.ready1, t.ready2, t.ready3, t.ready4, t.ready5].map((line) => <li key={line}>• {line}</li>)}
          </ul>
          <label className="flex items-center gap-3 rounded-2xl border-2 border-line bg-card p-4 font-bold">
            <input type="checkbox" checked={ready} onChange={(e) => setReady(e.target.checked)} className="h-6 w-6 accent-ink" />
            {t.readyAll}
          </label>
          {!ready && <p className="mt-2 text-sm text-muted">{t.readyNotAll}</p>}
          <label className="mt-5 flex items-start gap-3 text-[0.95rem]">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-ink" />
            {t.consent}
          </label>
          <div className="mt-6">
            {signedIn === false && <VerifyWhatsApp label={t.join} onVerified={submit} />}
            {signedIn && <Notice tone="safe"><span className="flex items-center gap-2"><BadgeCheck className="h-5 w-5" aria-hidden />{t.verifyDone}</span></Notice>}
          </div>
          <ErrorText>{error}</ErrorText>
        </>
      )}
    </Shell>
  )
}
