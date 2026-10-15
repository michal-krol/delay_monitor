'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export type UserLocationStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'error'
export type UserPoint = { lat: number; lon: number; accuracyM: number }
export type UserLocation = {
  status: UserLocationStatus
  point: UserPoint | null
  request: () => Promise<UserPoint | null>
}

const OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
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
  const [point, setPoint] = useState<UserPoint | null>(null)
  // Refy, bo `request()` ma być stabilne i widzieć najnowszy stan także w tym samym ticku.
  const statusRef = useRef<UserLocationStatus>('idle')
  const pointRef = useRef<UserPoint | null>(null)
  const inflight = useRef<Promise<UserPoint | null> | null>(null)

  const request = useCallback((): Promise<UserPoint | null> => {
    if (pointRef.current) return Promise.resolve(pointRef.current)
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
      geo.getCurrentPosition(
        ({ coords }) => {
          const next = { lat: coords.latitude, lon: coords.longitude, accuracyM: coords.accuracy }
          pointRef.current = next
          setPoint(next)
          set('ready')
          resolve(next)
        },
        (err) => {
          set(err.code === PERMISSION_DENIED ? 'denied' : 'error')
          resolve(null)
        },
        OPTIONS,
      )
    }).finally(() => {
      inflight.current = null
    })
    inflight.current = pending
    return pending
  }, [])

  const value = useMemo(() => ({ status, point, request }), [status, point, request])
  return <UserLocationContext.Provider value={value}>{children}</UserLocationContext.Provider>
}

export function useUserLocation(): UserLocation {
  const ctx = useContext(UserLocationContext)
  if (!ctx) throw new Error('useUserLocation must be used inside <UserLocationProvider>')
  return ctx
}
