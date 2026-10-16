import { GTFS_STOP_ID_PATTERN } from '@/lib/validation'

/**
 * Stan widoku linii GTFS w URL-u (`?dir=&stop=&pane=&day=`). Wartości pochodzą
 * z regexów/list dozwolonych — zła wartość jest po cichu ignorowana (#4), nigdy
 * nie rzuca. Indeksu przystanku w URL-u nie trzymamy: `stopId` rozwiązuje
 * `resolveLineView()` względem załadowanego rozkładu.
 */

export type LineDay = 'weekday' | 'saturday' | 'sunday' | 'other'
export type LinePane = 'route' | 'timetable'
export type LineViewState = {
  directionId: number | null
  stopId: string | null
  pane: LinePane
  day: LineDay
}

export const DEFAULT_LINE_VIEW: LineViewState = {
  directionId: null,
  stopId: null,
  pane: 'route',
  day: 'weekday',
}

const PANES: ReadonlySet<string> = new Set<LinePane>(['route', 'timetable'])
const DAYS: ReadonlySet<string> = new Set<LineDay>(['weekday', 'saturday', 'sunday', 'other'])
const DIRECTION_ID_PATTERN = /^\d{1,2}$/

export function parseLineViewState(params: { get(name: string): string | null }): LineViewState {
  const dir = params.get('dir')
  const stop = params.get('stop')
  const pane = params.get('pane')
  const day = params.get('day')
  return {
    directionId: dir !== null && DIRECTION_ID_PATTERN.test(dir) ? Number(dir) : null,
    stopId: stop !== null && GTFS_STOP_ID_PATTERN.test(stop) ? stop : null,
    pane: pane !== null && PANES.has(pane) ? (pane as LinePane) : DEFAULT_LINE_VIEW.pane,
    day: day !== null && DAYS.has(day) ? (day as LineDay) : DEFAULT_LINE_VIEW.day,
  }
}

/** Dla `patchUrlParams()`: tylko cztery własne klucze; wartość domyślna/`null` = parametr znika. */
export function lineViewPatch(state: LineViewState): Record<string, string | null> {
  return {
    dir: state.directionId === null ? null : String(state.directionId),
    stop: state.stopId,
    pane: state.pane === DEFAULT_LINE_VIEW.pane ? null : state.pane,
    day: state.day === DEFAULT_LINE_VIEW.day ? null : state.day,
  }
}

/**
 * Kierunek po `directionId` (nie po indeksie tablicy); bez trafienia — pierwszy
 * kierunek zawierający `stopId`, inaczej pierwszy. Przystanek: pierwsze wystąpienie
 * `stopId` w kierunku (linie pętlowe powtarzają przystanki), inaczej 0.
 */
export function resolveLineView(
  state: LineViewState,
  directions: ReadonlyArray<{ directionId: number; stops: ReadonlyArray<{ stopId: string }> }>,
): { directionIndex: number; stopIndex: number } | null {
  if (directions.length === 0) return null

  const { stopId } = state
  const hasStop = (d: (typeof directions)[number]) => stopId !== null && d.stops.some((s) => s.stopId === stopId)

  let directionIndex = directions.findIndex((d) => d.directionId === state.directionId)
  if (directionIndex < 0) directionIndex = Math.max(0, directions.findIndex(hasStop))

  const stopIndex = stopId === null ? -1 : directions[directionIndex].stops.findIndex((s) => s.stopId === stopId)
  return { directionIndex, stopIndex: Math.max(0, stopIndex) }
}
