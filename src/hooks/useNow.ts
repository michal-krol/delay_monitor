'use client'

import { useEffect, useState } from 'react'

/** Bieżący czas (ms epoch) odświeżany co `tickMs` -- do wieku danych, który ma rosnąć bez nowego renderu rodzica. */
export function useNow(tickMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), tickMs)
    return () => clearInterval(timer)
  }, [tickMs])
  return now
}
