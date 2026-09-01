/**
 * Tytuł aplikacji w pustym stanie Pulpitu (`EmptyState`) — wydzielony, żeby
 * przyszła zmiana nazwy albo stylu miała jedno miejsce.
 *
 * BEZ linijki wersji/gałęzi: tę pokazuje pasek boczny (`Sidebar`), który jest
 * na ekranie zawsze. Wcześniej oba renderowały „v0.9.9 · dev" jednocześnie na
 * pustym Pulpicie.
 */
export function AppTitle() {
  return (
    <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
      Monitor opóźnień
    </h1>
  )
}
