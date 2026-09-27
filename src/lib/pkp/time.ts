/**
 * `/operations` czasem zwraca `plannedArrival`/`plannedDeparture`/`actual*` bez
 * oznaczenia strefy — np. `"2026-08-02T00:33:00"`, bez `Z` ani `+02:00`. To
 * czas zegarowy Warszawy, nie UTC; dokumentacja i ręcznie pisane fixture'y
 * (`fixtures/operations.json`) zakładały jawne przesunięcie, więc nikt tego
 * nie przewidział.
 *
 * `new Date(nagiCiag)` interpretuje taki ciąg w strefie *procesu*, nie
 * Warszawy. Lokalnie, gdzie strefa dev-maszyny bywa akurat Europe/Warsaw,
 * wynik wygląda poprawnie przypadkiem. Na Railway kontener domyślnie chodzi
 * w UTC, więc ten sam kod przesuwa czas o ok. 2h latem (CEST) / 1h zimą
 * (CET) — pociąg, który już odjechał, wygląda jak nadchodzący za chwilę.
 * Stąd zasada: żadne z tych czterech pól nie może przejść przez gołe
 * `new Date()` bez wcześniejszego przepuszczenia przez tę funkcję.
 */
const WARSAW_TZ = 'Europe/Warsaw'

// Dopasowuje wyłącznie oznaczenie strefy na końcu ciągu (Z albo ±HH:MM), nie
// myli go z myślnikami w części datowej ("2026-08-01").
const HAS_TIMEZONE_DESIGNATOR = /(Z|[+-]\d{2}:?\d{2})$/

/**
 * Przesunięcie strefy Europe/Warsaw (w minutach) w chwili `instant`, liczone
 * przez Intl — niezależnie od strefy procesu, więc CET/CEST wychodzi
 * poprawnie bez względu na to, gdzie działa kontener.
 */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(instant)
  const raw = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(raw)
  if (match === null) return 0
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3]))
}

function warsawOffsetMinutes(instant: Date): number {
  return zoneOffsetMinutes(instant, WARSAW_TZ)
}

/**
 * Ciąg z jawną strefą (Z albo offset) wraca bez zmian — idempotentne wobec
 * fixture'ów, które już mają `+02:00`. Ciąg bez strefy jest traktowany jako
 * czas zegarowy Warszawy i konwertowany na prawidłowy UTC.
 */
/**
 * Data kalendarzowa (`yyyy-MM-dd`) w strefie Warszawy, niezależnie od strefy
 * procesu — do parametrów `dateFrom`/`dateTo` w `/schedules`. Lokal `en-CA`
 * domyślnie formatuje datę jako ISO (`yyyy-MM-dd`), więc nie trzeba składać
 * ciągu ręcznie z osobnych pól roku/miesiąca/dnia.
 */
export function warsawDateString(instant: Date): string {
  return zonedDateString(instant, WARSAW_TZ)
}

/** Jak `warsawDateString`, ale dla dowolnej strefy — GTFS bierze ją z `CityFeed.timezone`. */
export function zonedDateString(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant)
}

/**
 * Epoka (ms) południa dnia kursowania `serviceDate` (yyyy-MM-dd) w strefie
 * `timeZone`. GTFS definiuje czasy przystanków jako przesunięcia od
 * (południe doby kursowania − 12 h), a NIE od północy: w dni zmiany czasu
 * północ+offset daje błąd godziny dla kursów po przejściu, południe nie
 * (przejście nigdy nie wypada w południe).
 *
 * To jedyne miejsce w warstwie GTFS, w którym data kursowania spotyka zegar —
 * `schedule.ts` liczy z tego `evAbsSec` raz przy ładowaniu i nic poniżej nie
 * przelicza czasu ponownie (niezmiennik #1).
 */
export function serviceDayNoonEpoch(serviceDate: string, timeZone: string): number {
  const noonUtc = new Date(`${serviceDate}T12:00:00Z`).getTime()
  return noonUtc - zoneOffsetMinutes(new Date(noonUtc), timeZone) * 60000
}

/** `[wczoraj, dziś, jutro]` względem daty kalendarzowej w strefie `timeZone`. */
export function serviceDateWindow(instant: Date, timeZone: string): [string, string, string] {
  const today = zonedDateString(instant, timeZone)
  return [shiftDateString(today, -1), today, shiftDateString(today, 1)]
}

/**
 * Chwila (epoka ms) → ISO 8601 z jawnym offsetem strefy `timeZone`
 * (`2026-09-02T23:55:00+02:00`). Bez frakcji sekund. Używane przez warstwę
 * GTFS do `plannedAt` — czas jest już absolutny, tu tylko renderowanie.
 */
export function isoInZone(epochMs: number, timeZone: string): string {
  const offsetMinutes = zoneOffsetMinutes(new Date(epochMs), timeZone)
  const wall = new Date(epochMs + offsetMinutes * 60000).toISOString().slice(0, 19)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  return `${wall}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

export function normalizeApiTimestamp(value: string): string {
  if (HAS_TIMEZONE_DESIGNATOR.test(value)) return value

  // Ten sam ciąg cyfr potraktowany, jakby już był UTC, daje punkt odniesienia
  // w granicach kilku godzin od prawdziwej chwili — wystarczająco blisko, by
  // Intl wybrał właściwą stronę granicy CET/CEST dla tej daty.
  const asIfUtc = new Date(`${value}Z`)
  if (Number.isNaN(asIfUtc.getTime())) return value

  const offsetMinutes = warsawOffsetMinutes(asIfUtc)
  return new Date(asIfUtc.getTime() - offsetMinutes * 60000).toISOString()
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** `dateStr` (yyyy-MM-dd) przesunięty o `days` dni. Czysta arytmetyka kalendarzowa w UTC-południe — bez ryzyka przesunięcia strefy przy zaokrąglaniu do doby. */
function shiftDateString(dateStr: string, days: number): string {
  const shifted = new Date(`${dateStr}T00:00:00Z`).getTime() + days * ONE_DAY_MS
  return new Date(shifted).toISOString().slice(0, 10)
}

/**
 * Składa planowy czas przystanku z `/schedules/route/...` (`operatingDate` +
 * `arrivalTime`/`departureTime` w formacie HH:mm:ss, lokalnie warszawskie) na
 * poprawny UTC ISO string. `dayOffset` (pole `arrivalDay`/`departureDay` z API)
 * przesuwa datę, gdy przystanek wypada po północy względem dnia kursowania —
 * bez tego pociąg jadący przez północ miałby planowy czas cofnięty o dobę.
 *
 * `time === null` (przystanek bez tej strony rozkładu, np. stacja końcowa bez
 * odjazdu) zwraca `null` — nie ma czego składać.
 */
export function combineWarsawDateAndTime(operatingDate: string, time: string | null, dayOffset: number | null): string | null {
  if (time === null) return null
  const date = dayOffset && dayOffset !== 0 ? shiftDateString(operatingDate, dayOffset) : operatingDate
  return normalizeApiTimestamp(`${date}T${time}`)
}

/**
 * Planowy czas przystanku: z realizacji, jeśli ją niesie, w przeciwnym razie
 * złożony z trasy rozkładowej (`arrivalTime`/`departureTime` + `operatingDate`).
 *
 * Realizacja ma pierwszeństwo — jest bliżej prawdy o TYM kursie niż wzorzec
 * rozkładu. Rezerwowe składanie z trasy istnieje, bo źródła planu bywają puste
 * niezależnie od siebie:
 *  - `/operations/train/{scheduleId}/{orderId}/{operatingDate}` NIGDY nie niesie
 *    planowych czasów (stwierdzone na żywym API, nie w dokumentacji) — panel
 *    szczegołów połączenia liczy plan z trasy od zawsze;
 *  - `/operations` niesie je tylko przy działającym `withPlanned=true` — a ten
 *    2026-08-30 przestał działać i tablica została z niczym.
 *
 * Mieszka tutaj, a nie w `board/`, z dwóch powodów: to czysta arytmetyka
 * kalendarzowa nad `combineWarsawDateAndTime()` obok, a `board/transform.ts`
 * i `board/trainDetail.ts` (jedyni konsumenci) są powiązane importem w jedną
 * stronę — wspólny helper w którymkolwiek z nich zamykałby cykl.
 *
 * Jedna implementacja dla obu widoków świadomie: AGENTS.md #2 opisuje, jak
 * dwie niezależne odpowiedzi na to samo pytanie już raz rozjechały tablicę
 * z panelem szczegółów.
 */
export function resolvePlannedTime(
  apiPlanned: string | null,
  operatingDate: string | null,
  time: string | null | undefined,
  dayOffset: number | null | undefined
): string | null {
  if (apiPlanned !== null) return apiPlanned
  if (operatingDate === null) return null
  return combineWarsawDateAndTime(operatingDate, time ?? null, dayOffset ?? null)
}
