import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, setSession } from '../api'
import { useT } from '../i18n'
import { Shell, Title } from '../ui'

interface Redeemed { session: string; purpose: 'join' | 'request' | 'me' | 'checkin'; request_token: string | null }

/** Every WhatsApp button lands here: sign in silently, then go straight to the one screen it's for. */
export default function ActionLink() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { t } = useT()
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    api<Redeemed>(`/auth/link/${token}`, { method: 'POST' }).then(
      (r) => {
        setSession(r.session)
        const next = params.get('next')
        const to =
          r.purpose === 'join' ? '/join'
          : r.purpose === 'request' ? `/r/${r.request_token}`
          : r.purpose === 'checkin' ? `/r/${r.request_token}?checkin=1`
          : next === 'request' ? '/request'
          : next?.startsWith('/r/') ? next
          : '/me'
        nav(to, { replace: true })
      },
      () => setExpired(true),
    )
  }, [token, params, nav])

  return <Shell>{expired && <Title sub={t.linkExpired}>{t.appName}</Title>}</Shell>
}
