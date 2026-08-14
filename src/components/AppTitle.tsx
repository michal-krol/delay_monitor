/**
 * Tytuł aplikacji. Renderowany w dwóch wzajemnie wykluczających się stanach
 * strony (pusty stan bez ulubionych i nagłówek dashboardu) — wydzielony, żeby
 * przyszła zmiana nazwy albo stylu nie mogła po cichu rozjechać się między
 * dwoma miejscami.
 *
 * Wersja/gałąź pod tytułem, drobnym drukiem — jedyny sposób odróżnienia na
 * pierwszy rzut oka, że to `dev` uruchomione lokalnie, a nie produkcyjny
 * `main` (oba mogą wyglądać identycznie poza tym). Wartości zamrożone przy
 * buildzie (`next.config.ts`, `NEXT_PUBLIC_APP_VERSION`/`NEXT_PUBLIC_APP_BRANCH`).
 */
export function AppTitle() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        Monitor opóźnień
      </h1>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        v{process.env.NEXT_PUBLIC_APP_VERSION} · {process.env.NEXT_PUBLIC_APP_BRANCH}
      </p>
    </div>
  )
}
