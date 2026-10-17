'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type UserLocationStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'error'
export type UserPoint = { lat: number; lon: number; accuracyM: number }
export type UserLocation = {
  status: UserLocationStatus
  point: UserPoint | null
  /** Kiedy ustalono `point` (ms, `Date.now()`); `null` bez pozycji. Strona nie pokazuje starej pozycji jako bieżącej. */
  fixAt: number | null
  request: () => Promise<UserPoint | null>
}

/** Jak długo ustalona pozycja jest „bieżąca": tyle samo co `maximumAge` — starsza wymaga nowego pytania (po kliknięciu). */
export const LOCATION_MAX_AGE_MS = 60_000
const OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10000, maximumAge: LOCATION_MAX_AGE_MS }
/** Odpowiedź nie nadeszła mimo `timeout` (prompt zamknięty bez wyboru — `timeout` liczy się dopiero po zgodzie): dajemy ponowić. */
const WATCHDOG_MS = 15_000
const PERMISSION_DENIED = 1

const UserLocationContext = createContext<UserLocation | null>(null)

/**
 * Pozycja użytkownika (adr/0012): pytamy dopiero po kliknięciu (`request()`), jednorazowo
 * (`getCurrentPosition`, nigdy `watchPosition`), a współrzędne żyją wyłącznie w pamięci tego
 * komponentu — bez localStorage, URL-a, logów i serwera (#4). Odmowa jest zapamiętana, więc
 * kolejne `request()` nie wywołują promptu ponownie.
 */
export function UserLocationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UserLocationStatus>('idle')
  const [fix, setFix] = useState<{ point: UserPoint; at: number } | null>(null)
  // Refy, bo `request()` ma być stabilne i widzieć najnowszy stan także w tym samym ticku.
  const statusRef = useRef<UserLocationStatus>('idle')
  const fixRef = useRef<{ point: UserPoint; at: number } | null>(null)
  const inflight = useRef<Promise<UserPoint | null> | null>(null)
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(watchdog.current), [])

  const request = useCallback((): Promise<UserPoint | null> => {
    // Pozycja starsza niż `maximumAge` nie jest „bieżąca": kolejne kliknięcie pyta o nową (nadal jedno żądanie naraz).
    if (fixRef.current && Date.now() - fixRef.current.at < LOCATION_MAX_AGE_MS) return Promise.resolve(fixRef.current.point)
    if (inflight.current) return inflight.current
    if (statusRef.current === 'denied') return Promise.resolve(null)
    const set = (s: UserLocationStatus) => {
      statusRef.current = s
      setStatus(s)
    }
    const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation
    if (!geo) {
      set('unavailable')
      return Promise.resolve(null)
    }
    set('requesting')
    const pending = new Promise<UserPoint | null>((resolve) => {
      let settled = false
      const settle = (apply: () => UserPoint | null): void => {
        if (settled) return
        settled = true
        clearTimeout(watchdog.current)
        resolve(apply())
      }
      const fail = (s: UserLocationStatus): null => {
        // Nieudane odświeżenie nie zostawia starej pozycji udającej bieżącą (#7).
        fixRef.current = null
        setFix(null)
        set(s)
        return null
      }
      watchdog.current = setTimeout(() => settle(() => fail('error')), WATCHDOG_MS)
      try {
        geo.getCurrentPosition(
          ({ coords }) =>
            settle(() => {
              const next = { lat: coords.latitude, lon: coords.longitude, accuracyM: coords.accuracy }
              fixRef.current = { point: next, at: Date.now() }
              setFix(fixRef.current)
              set('ready')
              return next
            }),
          (err) => settle(() => fail(err.code === PERMISSION_DENIED ? 'denied' : 'error')),
          OPTIONS,
        )
      } catch {
        settle(() => fail('error'))
      }
    }).finally(() => {
      inflight.current = null
    })
    inflight.current = pending
    return pending
  }, [])

  const value = useMemo(() => ({ status, point: fix?.point ?? null, fixAt: fix?.at ?? null, request }), [status, fix, request])
  return <UserLocationContext.Provider value={value}>{children}</UserLocationContext.Provider>
}

export function useUserLocation(): UserLocation {
  const ctx = useContext(UserLocationContext)
  if (!ctx) throw new Error('useUserLocation must be used inside <UserLocationProvider>')
  return ctx
}
