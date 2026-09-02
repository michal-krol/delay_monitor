/**
 * Typy warstwy GTFS. Bez logiki — funkcje żyją w `schedule.ts` (budowa)
 * i `query.ts` (odczyt).
 *
 * ŚWIADOMIE nie istnieje tu żadne pole opóźnienia ani „czasu faktycznego".
 * Zakres podprojektu (tylko rozkład, docelowo pozycje pojazdów) jest
 * egzekwowany strukturalnie: brak pola to mechanizm kontrolny.
 */

/** Rodzaj środka transportu — z `route_type`, sprowadzony do garści przypadków. */
export type GtfsMode = 'metro' | 'tram' | 'bus' | 'rail' | 'other'

export type GtfsStop = {
  id: string
  name: string
  lat: number
  lon: number
  /** Id zespołu przystankowego (patrz `groupStopId` w schedule.ts). */
  groupId: string
  /** `parent_station`, gdy niepuste — inaczej `null`. */
  parentId: string | null
  /** `platform_code`, gdy podane. */
  platformCode: string | null
  /**
   * `wheelchair_boarding` — TRÓJSTANOWE. GTFS `0` znaczy „brak informacji",
   * nie „niedostępny". Nie zwijać do boolean.
   */
  wheelchair: 0 | 1 | 2
}

/** Rodzaj linii — wyprowadzony z numeru/`route_desc` (patrz `lineKindFrom` w schema.ts). */
export type LineKind = 'regular' | 'night' | 'express' | 'replacement'

export type GtfsRoute = {
  id: string
  /** `route_short_name` (numer linii). */
  shortName: string
  /** `route_long_name`. */
  longName: string
  mode: GtfsMode
  kind: LineKind
  /** `#RRGGBB` po walidacji na granicy Zod, albo `null`. Nigdy surowy string z feedu. */
  color: string | null
  /**
   * Kolor tekstu na plakietce — liczony samodzielnie z luminancji WCAG
   * zwalidowanego `color` (`#000000` / `#ffffff`). `route_text_color` z feedu
   * jest ignorowany w całości: to mniej kodu niż walidacja drugiego
   * niezaufanego koloru i naprawia realny błąd (wiersz `route_color ===
   * route_text_color` renderował niewidoczny numer).
   */
  textColor: '#000000' | '#ffffff'
}

/** Jedno konkretne odjechanie linii z przystanku — wynik `nextDepartures()`. */
export type GtfsDeparture = {
  tripId: string
  routeId: string
  /** `route_short_name` (fallback `route_long_name`, dalej `routeId`). */
  line: string
  mode: GtfsMode
  /** Rodzaj linii (nocna/przyspieszona/…) — patrz `LineKind`. */
  lineKind: LineKind
  color: string | null
  headsign: string | null
  /** ISO z offsetem strefy miasta. */
  plannedAt: string
  /** Sekundy od (południe doby − 12 h). Może być ≥ 86400 dla kursów po północy. */
  departureSec: number
  /** Doba kursowania (yyyy-MM-dd), do której należy to zdarzenie. */
  serviceDate: string
  stopId: string
  platformCode: string | null
  wheelchair: 0 | 1 | 2
  /** Zdarzenie pochodzi z rozwinięcia `frequencies.txt` (metro, częste linie). */
  frequencyBased: boolean
}

/** Stan wczytywania rozkładu — wystawiany przez poller i trasę API. */
export type ScheduleState = 'loading' | 'ready' | 'failed'

/**
 * Rozkład jednego miasta w pamięci — struktura kolumnowa. Budowana raz przy
 * ładowaniu przez `buildSchedule()`, potem tylko czytana.
 *
 * Tablice typowane tam, gdzie liczba wierszy idzie w setki tysięcy / miliony
 * (przystanki, kursy, zdarzenia); zwykłe obiekty dla linii (326 wierszy — patrz
 * AGENTS.md o przeinżynierowaniu).
 */
export type GtfsSchedule = {
  feedVersion: string | null
  /** `[wczoraj, dziś, jutro]`. */
  serviceDates: [string, string, string]
  timezone: string
  /** Z `attributions.txt` — renderowana, nie zaszyta w kodzie. */
  attribution: string[]

  // --- przystanki ---
  stopIds: string[]
  stopNames: string[]
  stopLat: Float64Array
  stopLon: Float64Array
  /** Indeks rodzica w tablicach przystanków, albo -1. */
  stopParent: Int32Array
  /** Id zespołu per przystanek (równoległe do `stopIds`). */
  stopGroupIds: string[]
  stopPlatforms: (string | null)[]
  stopWheelchair: Uint8Array
  stopIndexById: Map<string, number>
  /** Id zespołu → indeksy przystanków (słupków) w nim. */
  groupMembers: Map<string, number[]>
  /** Nazwa zespołu (nazwa dowolnego z jego słupków) → id zespołu, do wyszukiwarki. */
  groupName: Map<string, string>
  /** Id zespołu → indeksy linii (`routes`), które go obsługują. Do kafelków wyszukiwarki i podsumowania stopu. */
  groupRoutes: Map<string, Set<number>>

  // --- linie ---
  routes: GtfsRoute[]
  routeIndexById: Map<string, number>

  // --- kursy ---
  tripIds: string[]
  /** Indeks linii per kurs. */
  tripRoute: Int32Array
  /** Indeks internowanego headsignu per kurs, albo -1. */
  tripHeadsign: Int32Array
  /** Doba kursowania: 0 = wczoraj, 1 = dziś, 2 = jutro. */
  tripServiceDay: Uint8Array
  /** `direction_id` (0/1), 2 = brak. */
  tripDirection: Uint8Array
  /** Kurs powstał z rozwinięcia `frequencies.txt`. */
  tripFrequencyBased: Uint8Array
  headsigns: string[]

  // --- zdarzenia (przyjazd/odjazd na słupku) ---
  evTrip: Uint32Array
  evStop: Uint32Array
  evArrSec: Int32Array
  evDepSec: Int32Array
  /** Absolutny czas (epoka, sekundy) — jedyne miejsce, gdzie data spotkała zegar. */
  evAbsSec: Float64Array
  evSeq: Uint16Array
  /** Liczba faktycznie użytych zdarzeń (tablice mogą być większe — rosną przez podwajanie). */
  evCount: number

  // --- indeks CSR: przystanek → jego zdarzenia, posortowane po evAbsSec ---
  stopEventOffset: Uint32Array
  stopEventOrder: Uint32Array

  // --- diagnostyka cichej korupcji ---
  droppedStopTimes: number
  droppedFrequencies: number
}
