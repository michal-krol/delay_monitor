export function ConfigErrorBanner() {
  return (
    <div
      role="alert"
      className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200"
    >
      Sprawdź klucz API — konfiguracja pollera jest nieprawidłowa.
    </div>
  )
}
