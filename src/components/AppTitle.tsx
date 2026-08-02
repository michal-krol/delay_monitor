/**
 * Tytuł aplikacji. Renderowany w dwóch wzajemnie wykluczających się stanach
 * strony (pusty stan bez ulubionych i nagłówek dashboardu) — wydzielony, żeby
 * przyszła zmiana nazwy albo stylu nie mogła po cichu rozjechać się między
 * dwoma miejscami.
 */
export function AppTitle() {
  return (
    <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
      Monitor opóźnień PKP
    </h1>
  )
}
