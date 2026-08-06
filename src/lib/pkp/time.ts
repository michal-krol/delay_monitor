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
function warsawOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: WARSAW_TZ, timeZoneName: 'longOffset' }).formatToParts(
    instant
  )
  const raw = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(raw)
  if (match === null) return 0
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3]))
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
  return new Intl.DateTimeFormat('en-CA', { timeZone: WARSAW_TZ }).format(instant)
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
