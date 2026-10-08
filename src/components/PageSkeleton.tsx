/**
 * Szkielet strony na czas ładowania trasy (`loading.tsx`) i wyboru miasta (`CityRedirect`) — zamiast
 * pustego ekranu lub gołego tekstu (#7). Jeden `main` jak `PageShell`; bloki są dekoracją, czytnik dostaje „Wczytywanie…”.
 */
export function PageSkeleton() {
  return (
    <main aria-busy="true" data-testid="page-skeleton" className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-8 sm:py-7">
      <span className="sr-only">Wczytywanie…</span>
      <div aria-hidden="true" className="h-8 w-48 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
      <div aria-hidden="true" className="h-11 w-full max-w-xl animate-pulse rounded-xl bg-black/5 dark:bg-white/5" />
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="h-24 w-full max-w-3xl animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
      ))}
    </main>
  )
}
