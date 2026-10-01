import { PageTitle } from './PageTitle'

/**
 * Tytuł aplikacji w pustym stanie Pulpitu (`EmptyState`) — wydzielony, żeby
 * przyszła zmiana nazwy albo stylu miała jedno miejsce.
 *
 * `h2`: h1 strony to „Pulpit” z `TopBar` — jeden h1 na stronę.
 *
 * BEZ linijki wersji/gałęzi: tę pokazuje pasek boczny (`Sidebar`), który jest
 * na ekranie zawsze. Wcześniej oba renderowały „v0.9.9 · dev" jednocześnie na
 * pustym Pulpicie.
 */
export function AppTitle() {
  return <PageTitle as="h2">Monitor opóźnień</PageTitle>
}
