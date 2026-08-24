export function ConfigErrorBanner() {
  return (
    <div
      role="alert"
      className="mb-4 rounded-2xl border px-4 py-3 backdrop-blur-xl"
      style={{
        borderColor: 'rgba(225,29,72,0.4)',
        backgroundColor: 'rgba(225,29,72,0.12)',
        color: 'var(--status-cancelled-fg)',
      }}
    >
      Sprawdź klucz API — konfiguracja pollera jest nieprawidłowa.
    </div>
  )
}
