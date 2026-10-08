import { NotFoundScreen } from '@/components/NotFoundScreen'

/** Nieznany adres (poza grupą `(app)`, więc bez nawigacji aplikacji) — to jedyna 404 dla URL-i bez trasy. */
export default function RootNotFound() {
  return <NotFoundScreen />
}
