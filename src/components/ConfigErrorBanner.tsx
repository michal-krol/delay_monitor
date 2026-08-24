export function ConfigErrorBanner() {
  return (
    <div
      role="alert"
      className="mb-4 rounded-2xl border px-4 py-3 backdrop-blur-xl text-rose-700 dark:text-white"
      style={{
        borderColor: 'rgba(225,29,72,0.4)',
        backgroundColor: 'rgba(225,29,72,0.12)',
      }}
    >
      Sprawdź klucz API — konfiguracja pollera jest nieprawidłowa.
    </div>
  )
}
