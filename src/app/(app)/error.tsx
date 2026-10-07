'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { STATUS_ACTION_CLASS, StatusScreen } from '@/components/StatusScreen'

/**
 * Granica błędu segmentu `(app)` — chrome (nawigacja) zostaje, błąd łapie tylko treść strony. Next 16.3:
 * `retry()` (nie `reset()`) ponawia pobranie i render. Surowy `error.message` NIE trafia do UI (#4) —
 * po stronie klienta ląduje tylko w konsoli.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <StatusScreen
      title="Nie udało się wczytać tej strony"
      actions={
        <>
          <button type="button" onClick={() => retry()} className={STATUS_ACTION_CLASS}>
            Spróbuj ponownie
          </button>
          <Link href="/" className={STATUS_ACTION_CLASS}>
            Wróć do Pulpitu
          </Link>
        </>
      }
    >
      Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.
    </StatusScreen>
  )
}
