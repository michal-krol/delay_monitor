import type { ReactNode } from 'react'

/** Przycisk drugorzędny — ten sam wygląd co „Spróbuj ponownie” w `CityRedirect`. */
export const STATUS_ACTION_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-surface-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/5'

/**
 * Pełnoekranowy komunikat strony (404, błąd renderowania): jedno `h1`, krótki opis, akcje.
 * Treść podaje wywołujący — bez surowego tekstu błędu (#4: komunikat z serwera może zdradzać szczegóły).
 */
export function StatusScreen({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="glass flex max-w-md flex-col items-center gap-4 rounded-3xl px-8 py-10 text-center">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-text-secondary">{children}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div>
      </div>
    </main>
  )
}
