import { useEffect, useState } from 'react'

/** useState that survives a tab reload (e.g. while the user is away in WhatsApp verifying). */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch { return initial }
  })
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
  }, [key, value])
  return [value, setValue] as const
}

export function clearStored(prefix: string) {
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith(prefix)).forEach((k) => sessionStorage.removeItem(k))
  } catch { /* ignore */ }
}
