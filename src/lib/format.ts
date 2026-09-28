/**
 * Formatowanie godziny „HH:MM" z ISO stringa, **zawsze w strefie warszawskiej**
 * niezależnie od strefy widza. To tablica PKP — godzina odjazdu ma być
 * warszawska, nawet gdy stronę ogląda ktoś z innej strefy czasowej. `AGENTS.md`
 * #1: godziny z `/schedules` czytamy jako warszawskie; wyświetlanie musi być
 * spójne.
 *
 * Scala pięć wcześniejszych kopii: `BoardTable`, `ConnectionDetails`,
 * `NetworkStatsCard`, wstawka w `BoardRowList` (te renderowały w strefie
 * widza — zmiana zachowania dla widzów spoza PL) oraz `formatWarsawTime`
 * w `StationAside` (już z jawnym `Europe/Warsaw`).
 *
 * Przeciążenie: `string` na wejściu -> zawsze `string`; `string | null` ->
 * `string | null`. Dzięki temu wołający z gwarantowanym czasem nie musi
 * koalescować, a `ConnectionDetails` (czasy bywają `null`) dostaje `null`.
 */
export function formatClockTime(iso: string): string
export function formatClockTime(iso: string | null): string | null
export function formatClockTime(iso: string | null): string | null {
  if (iso === null) return null
  return new Date(iso).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Warsaw',
  })
}

/**
 * `sec` (sekundy od północy) → „HH:MM", zwinięte do doby. GTFS liczy godziny
 * kursów po północy jako >= 86400 (kurs zaczęty wczoraj, wciąż tego samego
 * dnia kursowania) -- `% 24` na godzinie pokazuje zegarowy czas, nie umowną
 * dobę. Scala pięć wcześniejszych kopii (`clock`/`clockOfSec` w
 * `CityTransitWidget`, `TransitStopDetail`, stronie linii).
 */
export function formatSecondsOfDay(sec: number): string {
  const hours = Math.floor(sec / 3600) % 24
  const minutes = Math.floor(sec / 60) % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Wiek danych w formie „N min" / „N h M min" -- do nagłówków statusu
 * (`BoardStatus`, `ScheduleStatus`), gdzie liczy się dokładność co do minuty,
 * nie zaokrąglenie do „przed chwilą" jak w `formatAgo` niżej.
 */
export function formatAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}

/**
 * Wiek chwili w formie rozmownej -- „przed chwilą" / „N s temu" / „N min
 * temu" / „N h temu". Do diagnostyki (`PollerDiagnostics`) i pozycji na
 * mapie (dawny `ageLabel` w `mapData.ts`), gdzie liczy się szybki rzut oka,
 * nie precyzja `formatAge` powyżej. Ujemny wiek (przesunięcie zegara)
 * przycięty do zera -- nigdy „−3 s temu".
 */
export function formatAgo(ageSec: number): string {
  const seconds = Math.max(0, Math.round(ageSec))
  if (seconds < 5) return 'przed chwilą'
  if (seconds < 60) return `${seconds} s temu`
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${minutes} min temu`
  return `${Math.round(minutes / 60)} h temu`
}

/**
 * Czas trwania w formie „N min" / „N h" / „N h M min" -- czas przejazdu,
 * odliczanie „za ile". Scala kopie z `ConnectionDetails` i
 * `TransitDepartureList`; obie miały identyczną arytmetykę, różniły się tylko
 * obsługą `null`/ujemnych minut na wejściu -- to zostaje po stronie wołającego.
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} h`
  return `${hours} h ${rest} min`
}
