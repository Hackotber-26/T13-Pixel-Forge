import { BadgeCheck, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, BLOOD_GROUPS, type Ailment, type BloodGroup, type Component, type Hospital, type Urgency } from '../api'
import { HospitalSearch } from '../HospitalSearch'
import { useT } from '../i18n'
import { InteractiveMap, PinPicker, type Point } from '../maps'
import { BackButton, BloodLabel, Button, Choice, ErrorText, Label, Notice, Shell, Steps, Title } from '../ui'
import { VerifyWhatsApp } from '../VerifyWhatsApp'
import { useSignedIn } from '../useSignedIn'

const COMPONENTS: Component[] = ['whole_blood', 'platelets', 'plasma']
const URGENCIES: Urgency[] = ['now', 'today', 'tomorrow']
const AILMENTS: Ailment[] = ['accident', 'surgery', 'childbirth', 'disease', 'critical']
const DRAFT_KEY = 'raksha.requestDraft'

// Verifying sends the user to WhatsApp; keep the form if the browser reloads the tab meanwhile.
const saved: Record<string, unknown> = (() => {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}') } catch { return {} }
})()
const init = <T,>(key: string, fallback: T): T => (key in saved ? (saved[key] as T) : fallback)

export default function NewRequest() {
  const { t } = useT()
  const nav = useNavigate()
  const signedIn = useSignedIn()
  const [step, setStep] = useState(init('step', 1))
  const [group, setGroup] = useState<BloodGroup | null>(init('group', null))
  const [component, setComponent] = useState<Component>(init('component', 'whole_blood'))
  const [units, setUnits] = useState(init('units', 1))
  const [hospital, setHospital] = useState<Hospital | null>(init('hospital', null))
  const [pinMode, setPinMode] = useState(init('pinMode', false))
  const [pin, setPin] = useState<Point | null>(init('pin', null))
  const [pinName, setPinName] = useState(init('pinName', ''))
  const [urgency, setUrgency] = useState<Urgency>(init('urgency', 'now'))
  const [ailment, setAilment] = useState<Ailment | null>(init('ailment', null))
  const [note, setNote] = useState(init('note', ''))
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [step])
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, group, component, units, hospital, pinMode, pin, pinName, urgency, ailment, note }))
    } catch { /* ignore */ }
  }, [step, group, component, units, hospital, pinMode, pin, pinName, urgency, ailment, note])

  const whereOk = pinMode ? !!pin && pinName.trim().length >= 3 : !!hospital

  const submit = useCallback(async () => {
    setError(''); setSending(true)
    try {
      const { token } = await api<{ token: string }>('/requests', {
        body: {
          blood_group: group, component, units, urgency,
          ailment: ailment ?? undefined, note: note.trim() || undefined,
          ...(pinMode ? { pinned_hospital: { name: pinName.trim(), ...pin } } : { hospital_id: hospital!.id }),
        },
      })
      try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      nav(`/r/${token}`, { replace: true })
    } catch (e) {
      setError((e as Error).message); setSending(false)
    }
  }, [group, component, units, urgency, ailment, note, pinMode, pinName, pin, hospital, nav])

  const bar =
    step === 1 ? <Button disabled={!group} onClick={() => setStep(2)}>{t.next}</Button>
    : step === 2 ? <Button disabled={!whereOk} onClick={() => setStep(3)}>{t.next}</Button>
    : signedIn ? <Button tone="blood" disabled={sending} onClick={submit}>{t.sendRequest}</Button>
    : null

  return (
    <Shell bar={bar}>
      {step > 1 && (
        <BackButton onClick={() => setStep(step - 1)} />
      )}
      <Steps step={step} total={3} />

      {step === 1 && (
        <>
          <Title>{t.reqTitle1}</Title>
          <Label>{t.bloodGroup}</Label>
          <div className="grid grid-cols-4 gap-2">
            {BLOOD_GROUPS.map((g) => (
              <Choice key={g} selected={group === g} onClick={() => setGroup(g)} className="display py-3 text-2xl">{g}</Choice>
            ))}
          </div>
          <div className="mt-6">
            <Label>{t.component}</Label>
            <div className="grid grid-cols-3 gap-2">
              {COMPONENTS.map((c) => (
                <Choice key={c} selected={component === c} onClick={() => setComponent(c)}>{t[c]}</Choice>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">{t.askDoctor}</p>
          </div>
          <div className="mt-6">
            <Label>{t.units}</Label>
            <div className="flex items-center gap-3">
              <button aria-label="−1" onClick={() => setUnits(Math.max(1, units - 1))} disabled={units <= 1} className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-line bg-card hover:border-ink disabled:opacity-40"><Minus className="h-5 w-5" aria-hidden /></button>
              <span className="display w-10 text-center text-4xl" aria-live="polite">{units}</span>
              <button aria-label="+1" onClick={() => setUnits(Math.min(10, units + 1))} disabled={units >= 10} className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-line bg-card hover:border-ink disabled:opacity-40"><Plus className="h-5 w-5" aria-hidden /></button>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Title>{t.reqTitle2}</Title>
          <Label>{t.hospital}</Label>
          {pinMode ? (
            <div className="space-y-3">
              <input
                value={pinName} onChange={(e) => setPinName(e.target.value)} placeholder={t.pinName}
                className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-lg outline-none focus:border-ink"
              />
              <PinPicker value={pin} onChange={setPin} />
              <Notice>{t.pinNote}</Notice>
            </div>
          ) : (
            <>
              {!hospital && <HospitalSearch value={hospital} onPick={setHospital} onNotFound={() => setPinMode(true)} />}
              {hospital && <HospitalConfirm hospital={hospital} onChange={() => setHospital(null)} />}
            </>
          )}
          <div className="mt-6">
            <Label>{t.neededBy}</Label>
            <div className="grid grid-cols-3 gap-2">
              {URGENCIES.map((u) => <Choice key={u} selected={urgency === u} onClick={() => setUrgency(u)}>{t[u]}</Choice>)}
            </div>
          </div>
          <div className="mt-6">
            <Label>{t.reason}</Label>
            <div className="flex flex-wrap gap-2">
              {AILMENTS.map((a) => (
                <Choice key={a} selected={ailment === a} onClick={() => setAilment(ailment === a ? null : a)}>{t[a]}</Choice>
              ))}
            </div>
          </div>
          <div className="mt-6">
            <Label>{t.note}</Label>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} rows={2} placeholder={t.notePlaceholder}
              className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 outline-none focus:border-ink"
            />
            <p className="text-sm text-muted">{t.noteHelp}</p>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <Title sub={t.reqVerifySub}>{t.reqTitle3}</Title>
          {group && (
            <div className="mb-5 flex items-center gap-4 rounded-2xl border border-line bg-card p-4">
              <BloodLabel group={group} component={component} size="md" />
              <div className="min-w-0">
                <p className="font-bold leading-snug">{pinMode ? pinName : hospital?.name}</p>
                <p className="text-sm text-muted">{t.unitCount(units)}, {t[urgency]}{ailment ? `, ${t[ailment]}` : ''}</p>
              </div>
            </div>
          )}
          {signedIn === false && <VerifyWhatsApp onVerified={submit} />}
          {signedIn && <Notice tone="safe"><span className="flex items-center gap-2"><BadgeCheck className="h-5 w-5" aria-hidden />{t.verifyDone}</span></Notice>}
          <ErrorText>{error}</ErrorText>
        </>
      )}
    </Shell>
  )
}

/** After picking from search: show it on a map so a wrong "Sparsh Clinic" is caught before donors are alerted. */
function HospitalConfirm({ hospital, onChange }: { hospital: Hospital; onChange: () => void }) {
  const { t } = useT()
  const place = [hospital.address, hospital.city].filter(Boolean).join(', ')
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-ink bg-card">
      <InteractiveMap center={{ lat: hospital.lat, lng: hospital.lng }} centerLabel={hospital.name} height="h-40" />
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">{t.confirmHospitalTitle}</p>
          <p className="text-lg font-bold leading-snug">{hospital.name}</p>
          {(place || hospital.distance_km != null) && (
            <p className="text-sm text-muted">{place}{place && hospital.distance_km != null ? ', ' : ''}{hospital.distance_km != null && t.fromYou(hospital.distance_km)}</p>
          )}
        </div>
        <button onClick={onChange} className="min-h-11 shrink-0 rounded-xl border border-line px-4 font-bold hover:bg-paper">{t.changeHospital}</button>
      </div>
    </div>
  )
}
