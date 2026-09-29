'use client'

import { fetchJson, usePolling } from './usePolling'
import type { RealizationStatus } from '@/lib/board/realization'
import type { StationInsights, StationStats } from '@/lib/board/stationStats'

export type BoardApiRow = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainNumber: string
  trainLabel: string
  carrier: string
  carrierName: string | null
  category: string
  categoryName: string | null
  headsign: string | null
  /**
   * Wybrane przystanki pośrednie („przez Pruszków, Opoczno, Kielce").
   * Opcjonalne z tego samego powodu co `hasDisruption` niżej -- literały tego
   * typu w testach sprzed tego pola nie muszą się o nim uczyć.
   */
  via?: string[]
  /** Ile przystanków pośrednich nie zmieściło się w `via` -- „· +12 przystanków". */
  viaRemaining?: number
  plannedAt: string
  /** FAKT -- `null`, dopóki przystanek nie jest potwierdzony. */
  actualAt: string | null
  /** PROGNOZA -- przewidywana godzina dla niepotwierdzonego przystanku. Nigdy nie jest faktem; patrz `board/realization.ts`. */
  predictedAt?: string | null
  /** Minuty opóźnienia z `predictedAt`. Opcjonalne -- literały w testach sprzed tego pola nie muszą się o nim uczyć. */
  predictedDelayMinutes?: number | null
  /** `null`, gdy przystanek nie jest jeszcze potwierdzony (`status` będzie wtedy `notStarted`). */
  delayMinutes: number | null
  status: RealizationStatus
  /** Peron PLANOWY -- API nie reprezentuje zmiany peronu w ostatniej chwili. `null` = nie podano. */
  platform: string | null
  /** Tor PLANOWY, niezależny od `platform`. Formatowanie („2 / —") należy do komponentu. */
  track?: string | null
  /** Szacunek (nie fakt) ze stacji poprzedniej -- tylko przy `status === 'enRoute'`. Patrz `board/transform.ts`. */
  estimatedDelayMinutes: number | null
  /**
   * Czy cały przejazd (dowolna stacja trasy) jest objęty utrudnieniem -- patrz
   * `board/disruptions.ts`. Opcjonalne (nie `boolean`), świadomie: liczne
   * literały tego typu w testach powstałych przed tym polem nie muszą się
   * teraz o nim uczyć, żeby dalej się kompilować.
   */
  hasDisruption?: boolean
}

export type BoardApiSnapshot = {
  stationId: string
  stationName: string
  departures: BoardApiRow[]
  arrivals: BoardApiRow[]
  fetchedAt: string
  ageMs: number
  /**
   * Kafelki KPI i kontekst prawej kolumny widoku stacji -- liczone w cyklu
   * pollera, bez ani jednego dodatkowego zapytania do PKP (patrz
   * `lib/board/stationStats.ts`). Opcjonalne, bo starsze snapshoty w testach
   * ich nie mają; komponenty i tak muszą obsłużyć `null` w środku („nie
   * wiadomo" ≠ „zero").
   */
  stats?: StationStats
  insights?: StationInsights
  /** Treści utrudnień dotykających tej stacji -- patrz `board/disruptions.ts`. */
  disruptionMessages?: string[]
}

export type BoardApiResponse = {
  snapshots: (BoardApiSnapshot | null)[]
  budget: { hourly: number | null; daily: number | null } | undefined
  status: 'ok' | 'configError' | 'degraded'
  /** Tablica stoi na rozkładzie, bo realizacja nie zna dzisiejszego ruchu -- patrz `/api/board`. */
  realizationStale?: boolean
  /**
   * Realizacja niepełna: `/operations` miało kolejne strony, których poller nie
   * dociągnął (budżet / limit stron). Część pociągów bez realizacji pokaże się
   * jako „jeszcze nie wyjechał" mimo że jadą -- patrz `/api/board`, `BoardStatus`.
   */
  realizationIncomplete?: boolean
  throttled: boolean
}

const REFRESH_INTERVAL_MS = 30000
/**
 * Zamiast czekać pełne 30s na pierwsze dane po zimnym starcie (poller
 * budzi się async, `/api/board` nigdy na niego nie czeka -- patrz
 * `route.ts`), dopytujemy szybciej, dopóki snapshot jest jeszcze `null`.
 * Realny fetch z PKP zwykle kończy się w 1-3s, więc te kilka prób zwykle
 * wystarczy; potem wracamy do normalnego tempa (`usePolling` nigdy się nie poddaje).
 */
const FAST_RETRY_DELAYS_MS = [1000, 2000, 4000]

function stillLoading(json: BoardApiResponse): boolean {
  return json.status === 'ok' && json.snapshots.some((snapshot) => snapshot === null)
}

export function useBoard(stationIds: string[]) {
  // Klucz = lista stacji. `keepPreviousData`: dodanie/usunięcie przypiętej nie zeruje kart
  // pulpitu do czasu nowej odpowiedzi (Dashboard łączy snapshoty po id stacji).
  const key = stationIds.length === 0 ? null : stationIds.join(',')
  const { data: polled, error } = usePolling<BoardApiResponse>(key, () => fetchJson(`/api/board?stations=${encodeURIComponent(key ?? '')}`), {
    refreshMs: REFRESH_INTERVAL_MS,
    ladderMs: FAST_RETRY_DELAYS_MS,
    isLoading: stillLoading,
    keepPreviousData: true,
  })
  // Poprzednie snapshoty mają sens tylko dla pokrywającego się zestawu; rozłączny (np. `FullBoard`
  // po zmianie stacji) wraca do „ładowania", nie do wierszy innej stacji. Odpowiedź bez snapshotów
  // (`configError`, zimny start) niesie tylko status -- ten zostaje.
  const received = polled?.snapshots.filter((s) => s !== null) ?? []
  const stale = received.length > 0 && !received.some((s) => stationIds.includes(s.stationId))
  const data = stale ? null : polled
  return { data, error }
}
