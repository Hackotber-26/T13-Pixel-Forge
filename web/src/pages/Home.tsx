import { BadgeCheck, Building2, Check, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BankFinder } from '../BankFinder'
import { useT } from '../i18n'
import { Section, SiteShell, WA_NUMBER, waHiLink } from '../site'
import { BilingualLink, BloodLabel, Drop } from '../ui'
import { WaIcon } from '../VerifyWhatsApp'

// Red-cell compatibility (same table the matching engine starts from; clinically reviewed rules live in the DB).
const COMPAT: [string, string, string][] = [
  ['O−', 'Everyone', 'O−'],
  ['O+', 'O+, A+, B+, AB+', 'O+, O−'],
  ['A−', 'A±, AB±', 'A−, O−'],
  ['A+', 'A+, AB+', 'A±, O±'],
  ['B−', 'B±, AB±', 'B−, O−'],
  ['B+', 'B+, AB+', 'B±, O±'],
  ['AB−', 'AB±', 'AB−, A−, B−, O−'],
  ['AB+', 'AB+', 'Everyone'],
]

/** What a donor actually sees: the WhatsApp alert, then the family sees the yes. */
function HeroDemo() {
  const { t } = useT()
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      <div className="rounded-[2rem] border-[3px] border-ink bg-[#ECE5DD] p-4 pb-6 shadow-[8px_8px_0_#1B1F3B]">
        <div className="mb-3 flex items-center gap-2 border-b border-black/10 pb-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white"><Drop className="h-5 w-5" /></span>
          <span className="font-bold">Raksha</span>
        </div>
        <div className="max-w-[85%] rounded-xl rounded-tl-none bg-white p-3 shadow-sm">
          <p className="text-[0.95rem]">{t.mockAlert}</p>
          <p className="mt-1 text-xs text-muted">Raksha never asks for money.</p>
          <div className="mt-2 border-t border-line pt-2 text-center font-bold text-[#027EB5]">{t.mockButton}</div>
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-2xl border-2 border-ink bg-card p-3">
          <BloodLabel group="B+" component="whole_blood" size="md" />
          <div className="pt-1">
            <p className="flex items-center gap-1 font-bold text-safe"><BadgeCheck className="h-4 w-4" aria-hidden />{t.mockComing}</p>
            <p className="text-sm text-muted">{t.mockComingSub}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const { t, alt } = useT()
  return (
    <SiteShell>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 md:grid-cols-[1.15fr_1fr] md:px-6 md:pt-16">
        <div>
          <h1 className="display text-[2.6rem] md:text-[3.6rem]">{t.heroTitle}</h1>
          <p className="mt-4 max-w-xl text-lg text-muted md:text-xl">{t.heroSub}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <BilingualLink to="/request" main={t.needBlood} sub={alt.needBlood} />
            <BilingualLink to="/join" main={t.becomeDonor} sub={alt.becomeDonor} tone="outline" />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            {WA_NUMBER && (
              <a href={waHiLink} className="inline-flex min-h-11 items-center gap-2 font-bold text-safe no-underline hover:underline"><WaIcon />{t.heroWa}</a>
            )}
            <span className="inline-flex items-center gap-2 text-muted"><Building2 className="h-5 w-5" aria-hidden />{t.heroCoverage}</span>
          </div>
        </div>
        <HeroDemo />
      </section>

      <Section title={t.findBankTitle} sub={t.findBankSub}>
        <div className="max-w-3xl"><BankFinder /></div>
      </Section>

      <Section id="how" title={t.navHow}>
        <div className="grid gap-6 md:grid-cols-2">
          {[[t.familiesTitle, [t.fam1, t.fam2, t.fam3], '/request', t.needBlood, 'bg-blood'],
            [t.donorsTitle, [t.don1, t.don2, t.don3], '/join', t.becomeDonor, 'bg-ink']].map(([title, steps, to, cta, color]) => (
            <div key={title as string} className="rounded-3xl border border-line bg-card p-6 md:p-8">
              <h3 className="display text-3xl">{title as string}</h3>
              <ol className="mt-5 space-y-4">
                {(steps as string[]).map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`display flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-white ${color}`}>{i + 1}</span>
                    <p className="pt-0.5">{s}</p>
                  </li>
                ))}
              </ol>
              <Link to={to as string} className="mt-6 inline-flex min-h-11 items-center gap-1 font-bold text-ink hover:underline">{cta as string}<ChevronRight className="h-5 w-5" aria-hidden /></Link>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t.trustTitle}>
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {[[t.trust1t, t.trust1], [t.trust2t, t.trust2], [t.trust3t, t.trust3], [t.trust4t, t.trust4]].map(([h, p]) => (
            <div key={h} className="border-l-4 border-blood pl-4">
              <h3 className="text-xl font-bold">{h}</h3>
              <p className="mt-1 text-muted">{p}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t.whoTitle} sub={t.whoSub}>
        <div className="grid gap-8 md:grid-cols-[1fr_1.4fr]">
          <ul className="space-y-3">
            {[t.who1, t.who2, t.who3, t.who4].map((w) => (
              <li key={w} className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 font-medium">
                <Check className="h-5 w-5 shrink-0 text-safe" aria-hidden />{w}
              </li>
            ))}
          </ul>
          <div>
            <h3 className="mb-3 text-xl font-bold">{t.compatTitle}</h3>
            <div className="overflow-hidden rounded-2xl border border-line bg-card">
              <table className="w-full text-left text-[0.95rem]">
                <thead className="bg-paper text-sm text-muted">
                  <tr><th className="px-4 py-2 font-medium">{t.compatGroup}</th><th className="px-4 py-2 font-medium">{t.compatGives}</th><th className="px-4 py-2 font-medium">{t.compatGets}</th></tr>
                </thead>
                <tbody>
                  {COMPAT.map(([g, gives, gets]) => (
                    <tr key={g} className="border-t border-line">
                      <td className="display px-4 py-2 text-2xl text-blood">{g}</td>
                      <td className="px-4 py-2">{gives === 'Everyone' ? t.everyone : gives}</td>
                      <td className="px-4 py-2">{gets === 'Everyone' ? t.everyone : gets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-muted">{t.compatNote}</p>
          </div>
        </div>
      </Section>

      <Section id="faq" title={t.faqTitle}>
        <div className="max-w-3xl divide-y divide-line rounded-3xl border border-line bg-card">
          {([[t.faq1q, t.faq1a], [t.faq2q, t.faq2a], [t.faq3q, t.faq3a], [t.faq4q, t.faq4a], [t.faq5q, t.faq5a], [t.faq6q, t.faq6a]]).map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold">
                {q}<span className="text-2xl text-muted transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      <section className="mx-auto mt-20 max-w-6xl px-4 md:px-6">
        <div className="flex flex-col items-start gap-6 rounded-3xl bg-blood p-8 text-white md:flex-row md:items-center md:justify-between md:p-12">
          <div>
            <h2 className="display text-[2.2rem] md:text-[2.8rem]">{t.ctaTitle}</h2>
            <p className="mt-2 max-w-xl text-white/85">{t.ctaSub}</p>
          </div>
          <Link to="/join" className="shrink-0 rounded-2xl bg-white px-8 py-4 text-lg font-bold text-blood no-underline">{t.becomeDonor}</Link>
        </div>
      </section>
    </SiteShell>
  )
}
