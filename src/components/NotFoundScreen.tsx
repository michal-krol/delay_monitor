import Link from 'next/link'
import { STATUS_ACTION_CLASS, StatusScreen } from './StatusScreen'

/** Treść 404 — wspólna dla `app/not-found.tsx` (nieznany adres) i `(app)/not-found.tsx` (`notFound()` ze stron). */
export function NotFoundScreen() {
  return (
    <StatusScreen
      title="Nie znaleziono strony"
      actions={
        <Link href="/" className={STATUS_ACTION_CLASS}>
          Wróć do Pulpitu
        </Link>
      }
    >
      Ta strona nie istnieje albo adres jest nieprawidłowy.
    </StatusScreen>
  )
}
