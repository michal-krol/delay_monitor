/**
 * Granica sieci warstwy GTFS. Logika domenowa (`schedule.ts`, `query.ts`)
 * zależy WYŁĄCZNIE od tego interfejsu, nie od implementacji — dzięki temu testy
 * nie potrzebują ani sieci, ani ZIP-a.
 *
 * Granica leży na ROZPAKOWANYCH strumieniach wpisów, nie na pliku ZIP:
 * `mock.ts` nigdy nie dotyka `zlib` ani binarnego archiwum.
 */

export interface GtfsClient {
  /**
   * Linie wpisu `name` (np. `stops.txt`) jako strumień, WŁĄCZNIE z nagłówkiem.
   * `null` = wpisu nie ma (np. `calendar.txt` bywa nieobecny, gdy kalendarz
   * siedzi wyłącznie w `calendar_dates.txt`).
   */
  readEntry(name: string): Promise<AsyncIterable<string> | null>
  /** `feed_version` z `feed_info.txt` — wartość otwarcia i strażnik spójności. */
  getFeedVersion(): Promise<string | null>
}

// ponytail: `createLiveClient(city)` — żądania zakresowe do feedu przez `zip.ts`
// — dochodzi w etapie 3 (`client.test.ts` mockuje `fetch`). Do tego czasu
// działa wyłącznie `mock.ts`, a `GTFS_DATA_SOURCE` domyślnie = `mock`.
