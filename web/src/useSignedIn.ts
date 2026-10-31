import { useEffect, useState } from 'react'
import { api, getSession } from './api'

/** null while checking, then whether the stored session is still valid. */
export function useSignedIn(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(getSession() ? null : false)
  useEffect(() => {
    if (!getSession()) return
    api('/me').then(() => setOk(true), () => setOk(false))
  }, [])
  return ok
}
