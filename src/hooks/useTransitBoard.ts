'use client'

import { fetchJson, usePolling } from './usePolling'
import type { AlertRecord } from '@/lib/gtfs/alerts'
import type { AlertFeedStatus } from '@/lib/gtfs/alertView'
import type { GtfsDeparture, GtfsMode, ScheduleState } from '@/lib/gtfs/types'
import type { GtfsLine, StopGroupMember, StopSummary } from '@/lib/gtfs/query'

export type TransitStopBoard = {
  stopId: string
  /** Id zespołu (`stopId` bywa przystankiem przy deep-linku z trasy linii). */
  groupId: string
  /** Przystanek, o który pytano wprost; `null` = cały zespół. Klient inicjuje z tego przełącznik. */
  requestedMember: string | null
  name: string
  modes: GtfsMode[]
  /** Linie obsługujące zespół, posortowane naturalnie. */
  lines: GtfsLine[]
  /** Sygnał dostępności: `'inaccessible'` / `'partial'` / `null` (patrz `StopGroup.wheelchairNote`). */
  wheelchairNote: 'inaccessible' | 'partial' | null
  /** Przystanki zespołu (Centrum 01, Centrum 02…) — do przełącznika. */
  members: StopGroupMember[]
  /** Aktywny przystanek, gdy zawężono odjazdy do jednego; inaczej `null` (cały zespół). */
  activeMember: string | null
  /**
   * Fakty rozkładowe (liczba linii, odjazdy dziś, pierwszy/ostatni, wykres godzinowy).
   * `null` gdy dzisiejsza data kursowania wypadła z rozkładu (#7) — TransitStopDetail
   * już renderuje to jako „—".
   */
  summary: StopSummary | null
  /** Alerty tej linii/przystanku (przez linie zespołu) — nigdy pole opóźnienia (#13). */
  /** `null` = feed alertów jeszcze nie odpowiedział (nieznane, nie „brak") -- patrz `/api/gtfs/board`. */
  alerts: AlertRecord[] | null
  /**
   * `vehicle` = pozycja pojazdu realizującego ten kurs, wyrażona jako dystans
   * w przystankach od obserwowanego przystanku (`stopsAway`, 0 = „zaraz będzie" —
   * pojazd jest na odcinku tuż przed tym przystankiem, zbliża się) plus wiek
   * danych. `null` gdy brak feedu pozycji, pytano o cały zespół albo pojazd
   * ten przystanek już minął. Zero pola opóźnienia (#13).
   */
  departures: (GtfsDeparture & { vehicle: { stopsAway: number; ageSec: number } | null })[]
}

export type TransitBoardResponse = {
  city: string
  schedule: {
    state: ScheduleState
    loadedAt: string | null
    ageMs: number | null
    phase: string | null
    serviceDates: [string, string, string] | null
    feedVersion: string | null
  }
  stops: (TransitStopBoard | null)[]
  /** Stan feedu komunikatów (`toContextAlertsState`); `null`/brak = nieznany (stary payload albo brak pollera). */
  alertFeed?: AlertFeedStatus | null
  attribution: string[]
}

/**
 * Odświeżanie co 30 s; dopóki rozkład się wczytuje (`schedule.state === 'loading'`)
 * albo alerty są jeszcze nieznane (`alerts: null`), ponawiamy domyślną drabinką
 * `usePolling` (`stop_times` mierzone lokalnie na 3,0 s, całe ładowanie to rząd
 * kilkunastu sekund).
 */
const REFRESH_INTERVAL_MS = 30000

const isBoardLoading = (json: TransitBoardResponse) =>
  json.schedule.state === 'loading' || json.stops.some((stop) => stop !== null && stop.alerts === null)

export function useTransitBoard(city: string | null, stopIds: string[], limit = 20, member: string | null = null) {
  const stopsKey = stopIds.join(',')
  // Klucz obejmuje wszystko, co wchodzi do URL-a; `keepPreviousData` -- przełączenie przystanku nie
  // zdejmuje pinów mapy ani podglądu w popupie (budowane z `data.stops[].members`) przed nową odpowiedzią.
  const key = city === null || stopIds.length === 0 ? null : JSON.stringify([city, stopsKey, limit, member])
  const { data: polled, error } = usePolling<TransitBoardResponse>(
    key,
    () =>
      fetchJson(
        `/api/gtfs/board?city=${encodeURIComponent(city as string)}&stops=${stopsKey}&limit=${limit}` +
          (member !== null ? `&member=${encodeURIComponent(member)}` : '')
      ),
    { refreshMs: REFRESH_INTERVAL_MS, isLoading: isBoardLoading, keepPreviousData: true }
  )

  // `keepPreviousData` ma chronić tylko przełączenie przystanku/limitu tego samego zestawu
  // przystanków; odpowiedź o INNYCH przystankach (albo mieście) nigdy nie może udawać
  // odpowiedzi na nowe pytanie -- wtedy wracamy do „ładowania".
  const data =
    polled !== null && polled.city === city && polled.stops.every((stop) => stop === null || stopIds.includes(stop.stopId)) ? polled : null

  // Trójstan wspólny dla każdego widoku tablicy miejskiej (TransitStopDetail,
  // TransitStopCard — AGENTS.md #2, jedna implementacja per regułę domenową).
  // GTFS może odpowiedzieć 200 z `schedule.state === 'loading'` zanim poller
  // wczyta feed (`data` już nie `null`, ale board wciąż nieznany) — to wciąż
  // „ładowanie", nigdy „błąd" (#7). „Błąd" = albo w ogóle brak odpowiedzi
  // (pierwszy fetch padł), albo serwer odpowiedział 200 z
  // `schedule.state === 'failed'` (poller nie wczytał feedu w ogóle) — to
  // drugie inaczej wygląda jak pusty rozkład (`stops: []`), nie jak błąd. Po
  // pierwszej udanej odpowiedzi `data` zostaje ostatnim dobrym stanem, nie
  // `null`, więc `failed` już nie zapala się na kolejnych odświeżeniach.
  const scheduleLoading = data !== null && data.schedule.state === 'loading'
  const loading = (data === null && error === null) || scheduleLoading
  const failed = (data === null && error !== null) || data?.schedule.state === 'failed'

  return { data, error, loading, failed }
}
