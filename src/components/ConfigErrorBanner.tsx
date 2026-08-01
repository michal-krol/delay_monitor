export function ConfigErrorBanner() {
  return (
    <div
      role="alert"
      className="mb-4 rounded-2xl border border-red-300/60 bg-red-50/90 px-4 py-3 text-red-800 backdrop-blur-xl dark:border-red-800/60 dark:bg-red-950/60 dark:text-red-200"
    >
      Sprawdź klucz API — konfiguracja pollera jest nieprawidłowa.
    </div>
  )
}
