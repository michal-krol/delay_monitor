/**
 * Czysta projekcja stanu feedu komunikatów dla UI (`ContextAlerts`, `useLineDetail`). Zero sieci:
 * wejściem jest widok istniejącego `AlertPoller` — bez nowego źródła i bez nowego interwału.
 * Definicja „alerty znane" zostaje w `knownAlerts()` (`alertPoller.ts`); tu tylko odróżniamy
 * awarię od pustego sukcesu (#7: nieznane ≠ brak).
 */
import type { AlertPollerView } from './alertPoller'
import type { AlertRecord } from './alerts'

export type AlertFeedStatus = {
  state: 'idle' | 'loading' | 'ready' | 'failed'
  /** Ostatnie UDANE pobranie (ISO); `null` = feed nigdy nie odpowiedział. */
  fetchedAt: string | null
  ageMs: number | null
}

export type ContextAlertsState = { state: 'loading' | 'ready' | 'failed'; stale: boolean }

/** Pole `alertFeed` odpowiedzi `/api/gtfs/{line,board}`; `null` = brak pollera (nie wiadomo). */
export function toAlertFeedStatus(view: AlertPollerView | undefined): AlertFeedStatus | null {
  return view === undefined ? null : { state: view.state, fetchedAt: view.fetchedAt, ageMs: view.ageMs }
}

/**
 * `stale` = ostatni dobry wynik istnieje (`fetchedAt != null`), a odświeżenie padło — to nie jest
 * ważność ogłoszenia. Liczby elementów nie czytamy jako sygnału sukcesu: `failed` bez udanego
 * pobrania też bywa `[]` (patrz `knownAlerts`). Bez metadanych (stary payload): `null` = wczytuje, lista = gotowe.
 */
export function toContextAlertsState(feed: AlertFeedStatus | null | undefined, alerts: AlertRecord[] | null): ContextAlertsState {
  if (feed === null || feed === undefined) return { state: alerts === null ? 'loading' : 'ready', stale: false }
  switch (feed.state) {
    case 'idle':
    case 'loading':
      return { state: 'loading', stale: false }
    case 'failed':
      return { state: 'failed', stale: feed.fetchedAt !== null }
    case 'ready':
      return { state: 'ready', stale: false }
  }
}

/** Jedna liczba/lista ogłoszeń w całym UI: po id (tytuły się powtarzają), pierwsze wystąpienie wygrywa. */
export function dedupeAlerts(alerts: AlertRecord[]): AlertRecord[] {
  const seen = new Set<string>()
  return alerts.filter((a) => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })
}
