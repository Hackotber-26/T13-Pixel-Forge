import { Navigation, Phone } from 'lucide-react'
import { directionsUrl, type Bank } from './api'
import { useT } from './i18n'
import { LinkButton } from './ui'

/** One blood bank: number matches its map marker; tapping the card highlights it on the map. */
export function BankCard({ bank, n, active, onFocus }: { bank: Bank; n: number; active: boolean; onFocus: () => void }) {
  const { t } = useT()
  const phone = bank.phone?.split(/[,;/]/)[0].trim()
  return (
    <div
      onClick={onFocus}
      className={`flex gap-3 rounded-2xl border bg-card p-4 transition-colors ${active ? 'border-ink ring-2 ring-ink/10' : 'border-line hover:border-muted/50'}`}
    >
      <span className={`display flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[2.5px] border-ink text-base ${active ? 'bg-ink text-white' : 'bg-card'}`}>{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold leading-snug">{bank.name}</p>
        <p className="text-sm text-muted">{t.kmAway(bank.distance_km)}{bank.address ? `, ${bank.address}` : ''}</p>
        <div className="mt-3 flex gap-2">
          {phone && <LinkButton tone="ink" className="flex-1" href={`tel:${phone}`}><Phone className="h-4 w-4" aria-hidden />{t.call}</LinkButton>}
          <LinkButton tone="quiet" className="flex-1" href={directionsUrl(bank.lat, bank.lng)}><Navigation className="h-4 w-4" aria-hidden />{t.directions}</LinkButton>
        </div>
      </div>
    </div>
  )
}
