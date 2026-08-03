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
