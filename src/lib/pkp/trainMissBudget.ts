import { createTtlCache } from '@/lib/cache'
import { logEvent } from '@/lib/log'

/**
 * Globalny limit zapytań PKP z powodu cache miss na trasie `/api/train` w
 * oknie jednej godziny (AGENTS.md #3, jedna replika -- stan w pamięci
 * procesu, AGENTS.md #5). Trafienia cache'u, zapamiętane 404 i dołączenia do
 * trwającego `inFlight` NIE liczą się -- tylko realny nowy fetch do PKP.
 *
 * Wydzielone z `src/app/api/train/route.ts` do osobnego modułu: Next.js
 * (App Router) dopuszcza w module trasy WYŁĄCZNIE eksporty pól trasy (`GET`,
 * `POST`, `dynamic`, ...) -- każdy inny eksport (tu: `resetMissWindowForTests`,
 * do testów) psuje wygenerowane typy w `.next/types/app/api/train/route.ts` i
 * wywala `next build` (`error TS2344 ... incompatible with index signature`).
 *
 * Koszt jednego miss (`client.ts` `fetchRoute`):
 *  - `/operations/train/...` -- zawsze, nigdy nie cache'owane: 1
 *  - `/schedules/route/...` -- 0, gdy trasa już jest w cache'u 24h z
 *    wcześniejszego miss tego samego pociągu (stan ustalony), ale 1 przy
 *    zimnym cache'u (pierwsze kliknięcie tego pociągu w ogóle) i 1 przy
 *    zmyślonym scheduleId/orderId (404 trasy, nie cache'owany -- patrz komentarz
 *    przy `fetchRoute`)
 *  - `client.getDisruptions(...)` -- klucz cache'u zawęża się do stacji TEGO
 *    pociągu i pojedynczego dnia, więc w praktyce prawie zawsze nowe
 *    zapytanie: 1
 * Razem: 2 przy ciepłym cache'u trasy, 3 przy zimnym (pierwsze kliknięcie) i
 * 2 dla zmyślonych ID (operacja 404 + trasa 404, bez utrudnień -- `stationIds`
 * puste).
 *
 * OWNER DECISION (2026-09-27): limit zostaje na 21, mimo że worst case
 * (wszystkie 21 misses zimne, po 3 zapytania) daje 21×3 + ~40 poller +
 * ~7 network-stats ≈ 110/h > twardy limit 100/h. Świadomie zaakceptowane
 * ryzyko do czasu przyznania klucza z wyższym limitem PKP (w trakcie
 * ubiegania się). Jeśli klucz zostanie przy 100/h, obniżyć limit do
 * floor((90 − 40 − 7) / 3) = floor(43 / 3) = 14.
 */
export const HOURLY_MISS_CAP = 21

/**
 * Ostatnie tyle misses w oknie godziny jest zarezerwowane WYŁĄCZNIE dla
 * żądań pierwszoplanowych (pierwsze wczytanie karty połączenia albo ręczne
 * odświeżenie) -- dociąganie w tle (`background=1`, patrz `ConnectionDetails`)
 * dostaje 503 wcześniej, zanim w ogóle sięgnie po ostatnie sloty. Bez tego
 * karta zostawiona otwarta w tle (interval co 5 min + focus/visibility) mogła
 * zająć CAŁY limit godziny, zanim nowy użytkownik zdążyłby kliknąć pierwszy
 * pociąg.
 */
export const FOREGROUND_RESERVE = 7

const HOUR_MS = 3_600_000

/**
 * Ile realnych misses w godzinie może zużyć JEDEN klient (IP). Bez tego anonimowy
 * klient wysyłający poprawne formatem, zmyślone scheduleId/orderId (po 2 zapytania
 * PKP każde, nigdy nie trafiają w cache) zjadał wspólny limit `HOURLY_MISS_CAP`
 * wszystkim innym. 8 ≈ realne użycie (kilka kliknięć + odświeżenia), a trzech
 * takich klientów dopiero wyczerpuje wspólne 21. Globalny limit zostaje bez zmian
 * (OWNER DECISION wyżej).
 */
export const PER_IP_HOURLY_MISS_CAP = 8

/**
 * Klucz = `godzina|ip`, więc okno resetuje się samo; TTL + limit wpisów
 * (AGENTS.md #5). Przy zalewie ponad `maxEntries` różnych IP najstarsze liczniki
 * wypadają (FIFO) -- limit globalny nadal działa.
 */
const newIpMisses = () => createTtlCache<number>({ ttlMs: HOUR_MS, maxEntries: 2000 })
let ipMisses = newIpMisses()

/**
 * Licznik miss w oknie bieżącej godziny epoki -- zerowany, gdy zmienia się
 * `Math.floor(Date.now() / HOUR_MS)`, więc nie trzeba osobnego timera do
 * resetu (jedna replika, stan w pamięci procesu, AGENTS.md #5).
 * `loggedCapReached` gwarantuje log `api.train.hourly_cap_reached` raz na
 * godzinę, nie przy każdym odrzuconym żądaniu (recenzja finalna, Minor 8).
 */
let missWindow = { hour: -1, count: 0, loggedCapReached: false }

function currentMissWindow(): typeof missWindow {
  const hour = Math.floor(Date.now() / HOUR_MS)
  if (missWindow.hour !== hour) {
    missWindow = { hour, count: 0, loggedCapReached: false }
  }
  return missWindow
}

/**
 * `true` i inkrementuje licznik, gdy pod limitem; `false` bez efektu
 * ubocznego, gdy limit wyczerpany. `background` (dociąganie w tle, patrz
 * `ConnectionDetails`) jest dodatkowo ograniczone do `HOURLY_MISS_CAP -
 * FOREGROUND_RESERVE` -- ostatnie sloty zostają dla pierwszego wczytania.
 */
export function consumeMissBudget(background: boolean, ip: string | null = null): boolean {
  const window = currentMissWindow()
  // `ip === null` (brak nagłówka: dev/testy) nie jest limitowane per IP --
  // zbiłoby wszystkich bezimiennych w jeden kubełek.
  const ipKey = ip === null ? null : `${window.hour}|${ip}`
  if (ipKey !== null && (ipMisses.get(ipKey) ?? 0) >= PER_IP_HOURLY_MISS_CAP) {
    return false
  }
  const limit = background ? HOURLY_MISS_CAP - FOREGROUND_RESERVE : HOURLY_MISS_CAP
  if (window.count >= limit) {
    if (!window.loggedCapReached) {
      logEvent('warn', 'api.train.hourly_cap_reached', { limit: HOURLY_MISS_CAP })
      window.loggedCapReached = true
    }
    return false
  }
  window.count += 1
  if (ipKey !== null) ipMisses.set(ipKey, (ipMisses.get(ipKey) ?? 0) + 1)
  return true
}

/** Wyłącznie do testów -- resetuje moduł między przypadkami (ten sam wzorzec co inne moduły ze stanem na poziomie modułu w tej bazie kodu, np. `board/networkStats.ts`). */
export function resetMissWindowForTests(): void {
  missWindow = { hour: -1, count: 0, loggedCapReached: false }
  ipMisses = newIpMisses()
}
