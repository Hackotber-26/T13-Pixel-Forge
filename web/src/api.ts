const BASE = import.meta.env.VITE_API_URL ?? '/api'
const SESSION_KEY = 'raksha.session'

export function getSession(): string | null {
  try { return localStorage.getItem(SESSION_KEY) } catch { return null }
}
export function setSession(token: string) {
  try { localStorage.setItem(SESSION_KEY, token) } catch { /* private mode: session lasts this tab only */ }
  memorySession = token
}
let memorySession: string | null = null

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const session = getSession() ?? memorySession
  const res = await fetch(BASE + path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Authorization: `Bearer ${session}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = typeof data.detail === 'string' ? data.detail
      : Array.isArray(data.detail) ? 'Please check the details and try again.' : 'Something went wrong. Please try again.'
    throw new ApiError(res.status, detail)
  }
  return data as T
}

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'
export const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
export type Component = 'whole_blood' | 'platelets' | 'plasma'
export type Urgency = 'now' | 'today' | 'tomorrow'
export type Ailment = 'accident' | 'surgery' | 'childbirth' | 'disease' | 'critical'

export interface Hospital { id: number; name: string; address: string | null; city: string | null; lat: number; lng: number; distance_km?: number }
export interface Bank { name: string; address: string | null; phone: string | null; category: string | null; lat: number; lng: number; distance_km: number }
export interface RequestView {
  token: string; blood_group: BloodGroup; component: Component; units: number
  hospital_name: string; hospital_verified: boolean; lat: number; lng: number
  urgency: Urgency; needed_by: string; ailment: Ailment | null; note: string | null
  status: 'active' | 'paused' | 'fulfilled' | 'closed' | 'expired'; created_at: string
  radius_km: number; searching: boolean
  counts: { alerted: number; viewed: number; coming: number }
  role: 'requester' | 'donor' | 'viewer'
  banks: Bank[]
  donors?: { name: string; blood_group: BloodGroup; phone: string; distance_km: number }[]
  my_match?: { status: string; distance_km: number }
  requester_phone?: string
}
export interface Me {
  phone: string
  donor: null | {
    name: string; blood_group: BloodGroup; area_label: string | null; open_to_donate: boolean
    snooze_until: string | null; last_donated_at: string | null; donations_count: number; lat: number; lng: number
  }
  history: { blood_group: BloodGroup; hospital_name: string; status: string; alerted_at: string }[]
  my_requests: { public_token: string; blood_group: BloodGroup; hospital_name: string; status: string; created_at: string }[]
}

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
