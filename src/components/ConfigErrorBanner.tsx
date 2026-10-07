export function ConfigErrorBanner() {
  return (
    <div
      role="alert"
      className="mb-4 rounded-2xl border border-error-text/40 bg-error-text/12 px-4 py-3 text-error-text"
    >
      Sprawdź klucz API — konfiguracja pollera jest nieprawidłowa.
    </div>
  )
}
