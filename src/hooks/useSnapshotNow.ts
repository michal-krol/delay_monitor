'use client'

import { useEffect, useState } from 'react'

/**
 * "Teraz" odświeżane tylko wtedy, gdy przyjdzie nowa porcja danych (`dep`),
 * nie na tykającym zegarze -- appka nie pokazuje relatywnego wieku, więc nie
 * ma po co re-renderować częściej niż i tak przychodzą dane (`StationCard`,
 * `FullBoard`). `Date.now()` w leniwym inicjalizatorze `useState` woła się raz,
 * przy montowaniu, żeby pierwszy render nie miał tranzjentnego, nieaktualnego
 * "teraz" (np. `0`), przez które filtr/dimowanie oparte na porównaniu z `now`
 * na chwilę pokazałoby złe dane.
 */
export function useSnapshotNow(dep: unknown): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Date.now() jest impure i nie może być wołane w renderze; efekt odświeża "teraz" tylko gdy przyjdzie nowy dep, nie w pętli
    setNow(Date.now())
  }, [dep])
  return now
}
