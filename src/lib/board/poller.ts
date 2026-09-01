import type { GetDisruptionsResult, PkpClient, RateLimitBudget } from '../pkp/client'
import { PkpApiError } from '../pkp/client'
import type { RawRoute, RawTrainOperation } from '../pkp/types'
import { transformOperations, type BoardSnapshot } from './transform'
import { indexRoutesByTrain } from './routeKey'
import { findStationDisruptionMessages, indexDisruptedTrains } from './disruptions'
import { collectUpstreamCandidates } from './upstreamEstimate'
import { computeStationStats } from './stationStats'
import { warsawDateString } from '../pkp/time'

const FORCE_RUN_THROTTLE_MS = 45000
const LOW_BUDGET_INTERVAL_MS = 5 * 60 * 1000

/**
 * Stacja obserwowana po raz pierwszy w tym cyklu nie ma jeszcze żadnych
 * stacji "pomocniczych" do estymacji (`auxStationIds` liczy się z wyniku
 * TEGO cyklu, na potrzeby NASTĘPNEGO — patrz `collectUpstreamCandidates`).
 * Pociąg naprawdę już jadący, ale bez potwierdzonego przystanku na świeżo
 * dodanej stacji ani wiarygodnego `trainStatus` z tego akurat zapytania,
 * przez to pokazywał się jako "jeszcze nie wyjechał" nawet kilka minut —
 * zaobserwowane na żywo (staging), samo się naprawiało dopiero po 2-3
 * zwykłych cyklach. Zamiast czekać pełny interwał, gdy ten cykl faktycznie
 * odkrył nowe stacje pomocnicze dla świeżo dodanej stacji, planujemy
 * kolejny przebieg dużo szybciej -- **raz**, bo od następnego cyklu ta
 * stacja nie jest już "nowo obserwowana" (ma już snapshot), więc warunek
 * poniżej sam się nie powtórzy.
 */
const NEW_STATION_FOLLOWUP_DELAY_MS = 2000

// Basic daje 1000 zapytań/dobę i 100/godzinę jednocześnie. Przy interwale 90 s
// zużywamy ~40/h, więc mniej niż 10 pozostałych w godzinie oznacza, że zaraz
// dostaniemy 429 — nawet jeśli budżet dobowy jest jeszcze zdrowy.
/**
 * Najkrótszy odstęp między zapytaniami o `/data-version`. Bez niego seria
 * zamrożonych cykli (co 90 s) zamieniłaby się w serię zapytań z limitu.
 * Zamrożenie i tak trwa godzinami, więc rzadsze sprawdzanie niczego nie gubi.
 */
const DATA_VERSION_MIN_INTERVAL_MS = 5 * 60 * 1000

const LOW_BUDGET_DAILY_THRESHOLD = 50
const LOW_BUDGET_HOURLY_THRESHOLD = 10

/**
 * Ile zapytań w oknie godzinowym musi zostać, żeby poller pozwolił sobie na
 * DODATKOWE zapytanie „dociągnij obserwowane stacje" po ucięciu `/operations`
 * (patrz `runTickBody`). Wyżej niż `LOW_BUDGET_HOURLY_THRESHOLD`, bo ten
 * re-fetch to koszt drugiego `/operations` na cykl — na wielkim węźle potrafi
 * podwoić zużycie. Bufor nad progiem awaryjnym: gdy budżet się kurczy,
 * rezygnujemy z re-fetchu (przełykamy niepełne dane), a nie z rdzenia cyklu.
 */
const REFETCH_MIN_HOURLY_BUDGET = 20

/**
 * Stacja bez danych wymusza przebieg poza harmonogramem, żeby pokazać rozkład
 * od razu po dodaniu do ulubionych. Bez limitu jest to jednak dźwignia: każde
 * nieznane ID omija dławik 45 s i zamienia się w zapytanie do PKP, więc seria
 * żądań wyczerpuje limit 100/h i degraduje aplikację dla wszystkich.
 *
 * Pula wymuszeń w oknie kroczącym zamyka dźwignię, zostawiając zapas
 * wielokrotnie wyższy niż realne użycie — użytkownik dodaje kilka stacji, nie
 * kilkadziesiąt na godzinę. Limit dotyczy **wyłącznie** obejścia dławika;
 * zwykły rytm (45 s od ostatniego przebiegu) jest już ograniczony sam przez się.
 */
const FORCED_RUN_WINDOW_MS = 60 * 60 * 1000
const MAX_FORCED_RUNS_PER_WINDOW = 10

/**
 * Domyślny twardy sufit liczby jednocześnie obserwowanych stacji w `interest`/
 * `snapshots`. TTL (`interestTtlMs`) sam ogranicza CZAS życia wpisu, ale nie
 * jego LICZBĘ w tym oknie -- bez tego seria żądań o różne, tylko poprawnie
 * sformatowane ID stacji (walidacja formatu w `/api/board` nie sprawdza, że
 * stacja naprawdę istnieje) rosłaby bez ograniczenia przez całe okno TTL
 * (AGENTS.md #5: cache musi mieć TTL I limit wpisów, nie gołą `Map`). Margines
 * wielokrotnie wyższy niż realna liczba stacji w sieci PKP (rzędu tysięcy).
 */
const DEFAULT_MAX_WATCHED_STATIONS = 5000

export type PollerConfig = {
  pollIntervalMs: number
  interestTtlMs: number
  /**
   * Co wyznacza listę połączeń — patrz `BOARD_SOURCE` w `config.ts`.
   * Domyślnie `operations` (zachowanie historyczne), żeby dziesiątki
   * istniejących testów pollera nie musiały tego podawać.
   */
  boardSource?: 'schedule' | 'operations'
  /** Nadpisanie `DEFAULT_MAX_WATCHED_STATIONS` -- głównie po to, żeby test mógł sprawdzić limit bez tysięcy wywołań. */
  maxWatchedStations?: number
}

/**
 * Poller potrzebuje wyłącznie odczytu nazwy stacji. Węższy typ niż `Map`
 * pozwala podać cache z eksmisją, a w testach zwykłą mapę.
 */
export type StationNameLookup = {
  get(stationId: string): string | undefined
}

export type PollerDeps = {
  client: PkpClient
  config: PollerConfig
  stationNames: StationNameLookup
  now?: () => number
}

/**
 * Czy warto zwolnić. Nieznany budżet (null — brak nagłówka w odpowiedzi) nie
 * jest traktowany jak niski: inaczej API, które przestało odsyłać nagłówki,
 * na stałe zepchnęłoby poller na interwał awaryjny.
 */
function isBudgetLow(budget: RateLimitBudget): boolean {
  if (budget.daily !== null && budget.daily < LOW_BUDGET_DAILY_THRESHOLD) return true
  if (budget.hourly !== null && budget.hourly < LOW_BUDGET_HOURLY_THRESHOLD) return true
  return false
}

/**
 * Czy odpowiedź `/operations` niesie cokolwiek, z czego da się zbudować wiersz
 * tablicy. `transformOperations` bramkuje każdy wiersz na obecności
 * `plannedArrival`/`plannedDeparture`, więc odpowiedź bez ani jednego planowego
 * czasu jest w całości bezużyteczna — niezależnie od tego, ile pociągów zawiera.
 *
 * Powód istnienia: 2026-08-30 `withPlanned=true` przestał działać po stronie
 * PKP (odpowiedź bajt w bajt identyczna z `withPlanned=false`). `/operations`
 * zwracał 1481 pociągów, z czego ZERO przystanków z planowym czasem — HTTP 200,
 * `generatedAt` świeże, poller `ok`, a każda tablica pusta. Awaria widoczna
 * tylko przez treść, nigdy przez status odpowiedzi.
 *
 * Pytamy o PLANOWY czas, nie o liczbę zbudowanych wierszy: pusta tablica bywa
 * prawdą (noc, pociągi poza oknem `VISIBLE_WINDOW_MS`), więc sama jej pustka
 * nie jest dowodem awarii. Brak planu przy niepustej liście pociągów — jest.
 */
export function hasUsablePlannedTimes(trains: RawTrainOperation[]): boolean {
  return trains.some((train) =>
    train.stations.some((stop) => stop.plannedArrival !== null || stop.plannedDeparture !== null)
  )
}

/**
 * Klucz przejazdu w odpowiedzi `/operations` — trójka identyfikatorów, ta sama
 * co w `disruptionTrainKey()`. Przejazd bez `operatingDate` jest pomijany przy
 * scalaniu (nie da się go jednoznacznie dopasować).
 */
function operationTrainKey(train: RawTrainOperation): string | null {
  return train.operatingDate === null ? null : `${train.scheduleId}-${train.orderId}-${train.operatingDate}`
}

/**
 * Scala przystanki „w górę trasy" z zapytania zbiorczego (obserwowane +
 * pomocnicze stacje) do listy z węższego, kompletnego zapytania o same
 * obserwowane stacje.
 *
 * Powód: `/operations` bez `fullRoutes` zwraca w `train.stations` **tylko te
 * przystanki, które były w zapytaniu**. Węższe zapytanie (same obserwowane
 * stacje) jest kompletne co do listy pociągów, ale każdy pociąg niesie wtedy
 * jeden przystanek — bez stacji pomocniczych nie ma z czego policzyć estymaty
 * „~+N min" (patrz `findUpstreamStops` w `transform.ts`). Zapytanie zbiorcze te
 * przystanki ma, tylko bywa ucięte na `OPERATIONS_PAGE_SIZE`. Bierzemy komplet
 * pociągów z węższego, a przystanki pomocnicze doklejamy z szerszego tam, gdzie
 * są. `base` decyduje o zbiorze pociągów; `withUpstream` tylko wzbogaca.
 */
export function mergeUpstreamStops(
  base: RawTrainOperation[],
  withUpstream: RawTrainOperation[]
): RawTrainOperation[] {
  const extra = new Map<string, RawTrainOperation>()
  for (const train of withUpstream) {
    const key = operationTrainKey(train)
    if (key !== null) extra.set(key, train)
  }

  return base.map((train) => {
    const key = operationTrainKey(train)
    const match = key === null ? undefined : extra.get(key)
    if (match === undefined) return train

    const seen = new Set(train.stations.map((stop) => stop.stationId))
    const added = match.stations.filter((stop) => !seen.has(stop.stationId))
    return added.length === 0 ? train : { ...train, stations: [...train.stations, ...added] }
  })
}

export type PollerStatus = 'ok' | 'configError' | 'degraded'

/**
 * Stan jednego endpointu PKP w ostatnim cyklu. Trzy stany, nie dwa — `null`
 * znaczy „jeszcze nie próbowano" i nigdy nie może wyrenderować się jako zero
 * ani jako błąd (AGENTS.md #3 i #7).
 */
export type EndpointHealth = {
  /** Czy OSTATNIA próba się powiodła. `null` = nie było jeszcze żadnej. */
  ok: boolean | null
  /** ISO ostatniej udanej odpowiedzi. `null` = nigdy się nie udało. */
  lastSuccessAt: string | null
  /** Ile rekordów przyszło w ostatniej udanej odpowiedzi (pociągi / trasy / utrudnienia). */
  records: number | null
}

/**
 * `EndpointHealth` dla `/operations` plus fakt, że zbiorcze zapytanie (z
 * stacjami pomocniczymi) zostało ucięte na `OPERATIONS_PAGE_SIZE` i poller
 * musiał dociągnąć realizację obserwowanych stacji osobno. `false` przy
 * zwykłym cyklu — dotyczy wyłącznie wielkich węzłów w szczycie ruchu.
 */
export type OperationsHealth = EndpointHealth & { truncatedRefetch: boolean }

/**
 * Migawka diagnostyczna cyklu — czego `PollerStatus` nie jest w stanie unieść.
 *
 * Pojedynczy `status` miesza w sobie awarię `/operations`, zamrożony feed i 401,
 * a o `/schedules` i `/disruptions` milczy zupełnie: ich awarie są łapane
 * lokalnie i degradują cicho. Przy pięciodniowej awarii PKP oznaczało to, że
 * z aplikacji nie dało się odczytać, KTÓRE źródło zawodzi.
 */
export type PollerDiagnostics = {
  /**
   * Czy realizacja nie wie NIC o dzisiejszym ruchu (żaden pociąg z dzisiejszą
   * `operatingDate`). Odkąd tablica potrafi się zbudować z samego rozkładu,
   * to rozróżnienie decyduje o treści komunikatu: „API nie odpowiada" i „są
   * godziny, ale nie znamy opóźnień" to dwie różne wiadomości dla pasażera.
   */
  realizationStale: boolean
  /** Realizacja plus informacja, czy zbiorcze zapytanie zostało ucięte (patrz `OperationsHealth`). */
  operations: OperationsHealth
  /** Rozkład plus informacja, czy trzeba było sięgnąć po wariant bez `fullRoute`. */
  schedules: EndpointHealth & { usedFullRouteFallback: boolean }
  disruptions: EndpointHealth
  /**
   * Wersje danych po stronie PKP — sprawdzane WARUNKOWO, dopiero gdy feed
   * wygląda na zamrożony (patrz `maybeCheckDataVersion`). `null`, dopóki nie
   * było powodu pytać, co samo w sobie jest dobrą wiadomością.
   */
  dataVersion: {
    operationsVersion: string | null
    schedulesVersion: string | null
    /** Znacznik ostatniej aktualizacji danych PO STRONIE PKP. */
    timestamp: string | null
    /** Kiedy MY o to zapytaliśmy — bez tego nie da się ocenić wieku `timestamp`. */
    checkedAt: string
  } | null
}

export type Poller = {
  registerInterest(stationIds: string[]): void
  getSnapshot(stationId: string): BoardSnapshot | undefined
  getBudget(): RateLimitBudget | undefined
  getStatus(): PollerStatus
  isAwake(): boolean
  /** Czy poller zwolnił poniżej skonfigurowanego tempa (niski budżet albo 429). */
  isThrottled(): boolean
  /**
   * Aktualny odstęp między przebiegami. `isThrottled()` mówi „zwolnił", to
   * mówi „o ile" — bez tego panel diagnostyczny pokazywałby sam bool.
   */
  getIntervalMs(): number
  /** Stan poszczególnych źródeł w ostatnim cyklu — patrz `PollerDiagnostics`. */
  getDiagnostics(): PollerDiagnostics
}

type RoutesLookup = {
  /** Czy pobranie rozkładu się powiodło -- awaria degraduje cicho, więc bez tego pola nie da się jej odróżnić od pustego rozkładu. */
  ok: boolean
  /** Czy klient musiał sięgnąć po wariant bez `fullRoute` (patrz `client.ts`). */
  usedFullRouteFallback: boolean
  routesByTrainId: Map<string, RawRoute>
  /**
   * Surowa lista tras, BEZ deduplikacji po kluczu przejazdu — statystyki
   * stacji liczą wystąpienia, więc muszą widzieć każdy rekord osobno.
   * Indeks wyżej celowo trzyma po jednej trasie na (przejazd, dzień) i do
   * liczenia się nie nadaje: zwijał 1094 dzisiejsze odjazdy do 910
   * (zmierzone na żywo, Warszawa Zachodnia).
   */
  routes: RawRoute[]
  carrierNames: Record<string, string>
  categoryNames: Record<string, string>
  /** Pełny słownik nazw stacji ze `/schedules` — patrz merge w `runTick`. */
  scheduleStationNames: Record<string, string>
}

async function fetchRoutesByTrainId(client: PkpClient, active: string[]): Promise<RoutesLookup> {
  try {
    const { routes, carrierNames, categoryNames, stationNames, usedFullRouteFallback } = await client.getSchedules(active)
    return {
      routesByTrainId: indexRoutesByTrain(routes),
      routes,
      carrierNames,
      categoryNames,
      scheduleStationNames: stationNames,
      ok: true,
      usedFullRouteFallback,
    }
  } catch (err) {
    console.error('Poller: błąd pobierania rozkładu (przewoźnik/kategoria będą puste)', err)
    return {
      routesByTrainId: new Map(),
      routes: [],
      carrierNames: {},
      categoryNames: {},
      scheduleStationNames: {},
      ok: false,
      usedFullRouteFallback: false,
    }
  }
}

/** Awaria pobrania utrudnień to wzbogacenie, nie rdzeń ticka -- degraduje łagodnie do braku badge'y, reszta cyklu działa dalej. */
async function fetchDisruptions(client: PkpClient, active: string[]): Promise<GetDisruptionsResult & { ok: boolean }> {
  try {
    return { ...(await client.getDisruptions(active)), ok: true }
  } catch (err) {
    console.error('Poller: błąd pobierania utrudnień (badge będzie niedostępny)', err)
    return { disruptions: [], disruptionTypes: {}, ok: false }
  }
}

export function createPoller(deps: PollerDeps): Poller {
  const { client, config, stationNames } = deps
  const now = deps.now ?? (() => Date.now())
  const maxWatchedStations = config.maxWatchedStations ?? DEFAULT_MAX_WATCHED_STATIONS

  const interest = new Map<string, number>()
  const snapshots = new Map<string, BoardSnapshot>()
  /**
   * Stacje "pomocnicze" -- dokładane do `/operations` obok prawdziwie
   * obserwowanych (`interest`), żeby liczyć estymatę opóźnienia dla
   * połączeń "w trasie" (patrz `upstreamEstimate.ts`). Świadomie POZA
   * `interest`: nie mają budzić pollera same z siebie, nie dostają
   * własnego `snapshots.set(...)`, nie przechodzą przez `/api/board`'s
   * limit 20 stacji -- to wyłącznie wewnętrzny dodatek do zapytania
   * `/operations`, przeliczany od zera po każdym udanym cyklu.
   */
  let auxStationIds: ReadonlySet<string> = new Set()
  /**
   * `timer` jest `null` przez CAŁY czas trwania `runTick()` (nie tylko
   * podczas snu), bo jest resetowany na starcie i ustawiany dopiero po
   * `await` na końcu -- więc `registerInterest()` wywołane w trakcie
   * trwającego zapytania widziałoby `wasAsleep` i wystrzeliwało drugi,
   * równoległy fetch do PKP. Ta flaga to blokuje.
   */
  let tickInFlight = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let currentIntervalMs = config.pollIntervalMs
  let lastRunAt = 0
  let budget: RateLimitBudget | undefined
  /** Znaczniki czasu wymuszonych przebiegów w bieżącym oknie kroczącym. */
  let forcedRunsAt: number[] = []
  let status: PollerStatus = 'ok'

  /** Patrz `PollerDiagnostics`. Startuje w stanie „jeszcze nie próbowano" (`null`), nie w „błąd". */
  const emptyHealth = (): EndpointHealth => ({ ok: null, lastSuccessAt: null, records: null })
  const diagnostics: PollerDiagnostics = {
    realizationStale: false,
    operations: { ...emptyHealth(), truncatedRefetch: false },
    schedules: { ...emptyHealth(), usedFullRouteFallback: false },
    disruptions: emptyHealth(),
    dataVersion: null,
  }
  /** Dławik zapytań o wersję danych -- patrz `maybeCheckDataVersion`. */
  let lastDataVersionCheckAt = 0

  /**
   * Ostatni rozkład, który udało się pobrać — BEZ TTL, świadomie.
   *
   * Nie wystarczy polegać na cache'u klienta: ma on TTL 24 h i po jego upływie
   * zwraca `undefined`, czyli przestaje działać dokładnie w dłuższej awarii,
   * kiedy jest najbardziej potrzebny. Odkąd rozkład wyznacza listę wierszy
   * (`boardSource: 'schedule'`), jego brak oznaczałby pustą tablicę.
   *
   * Wiek jest wystawiany w diagnostyce (`schedules.lastSuccessAt`): rozkład
   * sprzed trzech dni to nie ta sama informacja co sprzed godziny, a pokazanie
   * go bez wieku zamieniłoby jedno ciche kłamstwo na drugie.
   */
  let lastGoodRoutes: RawRoute[] | null = null

  function recordHealth(target: EndpointHealth, ok: boolean, records: number, at: string): void {
    target.ok = ok
    if (ok) {
      target.lastSuccessAt = at
      target.records = records
    }
  }

  /**
   * Pyta PKP o wersje danych, ale TYLKO gdy feed realizacji wygląda na
   * zamrożony -- i nie częściej niż raz na `DATA_VERSION_MIN_INTERVAL_MS`.
   *
   * Powód warunkowości: to kosztuje zapytanie z limitu 100/h, przy którym
   * poller zużywa już ~40. Zamrożenie trwa godzinami (zaobserwowane: pięć dób),
   * więc sygnał wyprzedzający niczego by nie zmienił -- ta odpowiedź jest
   * potrzebna dopiero wtedy, gdy trzeba rozstrzygnąć „to my nie pobieramy czy
   * oni nie publikują".
   */
  async function maybeCheckDataVersion(suspicious: boolean, at: string): Promise<void> {
    if (!suspicious) return
    if (now() - lastDataVersionCheckAt < DATA_VERSION_MIN_INTERVAL_MS) return
    lastDataVersionCheckAt = now()
    try {
      const version = await client.getDataVersion()
      diagnostics.dataVersion = {
        operationsVersion: version.operationsVersion,
        schedulesVersion: version.schedulesVersion,
        timestamp: version.timestamp,
        checkedAt: at,
      }
    } catch (err) {
      console.error('Poller: nie udało się sprawdzić wersji danych PKP', err)
    }
  }

  function pruneInactive(): string[] {
    const cutoff = now() - config.interestTtlMs
    for (const [stationId, ts] of interest) {
      if (ts < cutoff) {
        interest.delete(stationId)
        snapshots.delete(stationId)
      }
    }
    return [...interest.keys()]
  }

  async function runTick(): Promise<void> {
    if (tickInFlight) return
    tickInFlight = true
    try {
      await runTickBody()
    } finally {
      tickInFlight = false
    }
  }

  async function runTickBody(): Promise<void> {
    const realActive = pruneInactive()

    if (realActive.length === 0) {
      // Zasypianie czyści też stacje pomocnicze -- nie ma po co je nieść
      // dalej, skoro nic realnie obserwowanego nie zostało.
      auxStationIds = new Set()
      timer = null
      return
    }

    // Zanim `snapshots.set(...)` niżej je nadpisze -- stacje, które w tym
    // cyklu dostają swój PIERWSZY snapshot. To one mogą skorzystać na
    // szybszym powtórzeniu, patrz `NEW_STATION_FOLLOWUP_DELAY_MS`.
    const newlyObserved = realActive.filter((stationId) => !snapshots.has(stationId))
    let scheduleFollowUp = false

    lastRunAt = now()
    // /schedules pyta wyłącznie o realne stacje -- klucz cache'u 24h
    // (`schedulesCache`, patrz `client.ts`) musi być stabilny, więc migające
    // stacje pomocnicze NIE mogą do niego trafić, inaczej cache chybiałby
    // niemal co cykl. /operations pyta o realne ORAZ pomocnicze naraz --
    // nadal jedno zapytanie, tylko z kilkoma dodatkowymi ID.
    const operationsStationIds = [...new Set([...realActive, ...auxStationIds])]

    try {
      const [
        result,
        { routesByTrainId, routes, carrierNames, categoryNames, scheduleStationNames, ok: schedulesOk, usedFullRouteFallback },
        disruptions,
      ] = await Promise.all([
        client.getOperations(operationsStationIds),
        fetchRoutesByTrainId(client, realActive),
        fetchDisruptions(client, realActive),
      ])
      budget = result.budget
      const budgetLow = isBudgetLow(budget)
      currentIntervalMs = budgetLow ? LOW_BUDGET_INTERVAL_MS : config.pollIntervalMs

      /**
       * Zapytanie zbiorcze (obserwowane + pomocnicze stacje) potrafi na wielkim
       * węźle przekroczyć `OPERATIONS_PAGE_SIZE` — wtedy tracilibyśmy realizację
       * części dzisiejszych kursów obserwowanej stacji (status „nie wiadomo" na
       * tablicy, niepełna próbka w kafelkach KPI). Dociągamy wtedy same
       * obserwowane stacje osobnym, węższym zapytaniem (jedna stacja mieści się
       * w limicie z zapasem — zmierzone: max ~1550 przejazdów) i z niego liczymy
       * tablicę oraz statystyki; przystanki pomocnicze do estymaty doklejamy
       * z (uciętej) odpowiedzi zbiorczej. Koszt: +1 zapytanie tylko dla
       * węzłów w szczycie. Przy niskim budżecie odpuszczamy i przełykamy
       * niepełne dane, jak dotąd.
       */
      const usedAuxStations = operationsStationIds.length > realActive.length
      const canAffordRefetch =
        !budgetLow && (budget.hourly === null || budget.hourly >= REFETCH_MIN_HOURLY_BUDGET)
      let operationTrains = result.trains
      let truncatedRefetch = false
      if (result.truncated && usedAuxStations && canAffordRefetch) {
        try {
          const observed = await client.getOperations(realActive)
          operationTrains = mergeUpstreamStops(observed.trains, result.trains)
          truncatedRefetch = true
          budget = observed.budget
        } catch (err) {
          console.error(
            'Poller: dociągnięcie realizacji obserwowanych stacji po ucięciu /operations nie powiodło się — używam danych z ucięcia',
            err
          )
        }
      }

      const disruptedTrains = indexDisruptedTrains(disruptions.disruptions)
      const fetchedAt = new Date(now()).toISOString()

      // /operations nie ma już (świadomie, patrz client.ts) własnego pełnego
      // słownika nazw stacji — zasila go teraz /schedules. `result.stationNames`
      // idzie na wierzch jako świeższe dla samej zapytanej stacji.
      const mergedStationNames = { ...scheduleStationNames, ...result.stationNames }
      // Data warszawska, nie `new Date().toISOString().slice(0,10)` -- na
      // Railway proces chodzi w UTC, więc po 22:00 lokalnego czasu „dzisiaj"
      // rozjechałoby się o dobę i statystyki liczyłyby jutrzejszy rozkład
      // (AGENTS.md #1).
      const todayIsoDate = warsawDateString(new Date(fetchedAt))
      // Rozkład zapamiętujemy tylko wtedy, gdy pobranie się udało I coś przyszło:
      // pusta odpowiedź po udanym zapytaniu nie może skasować ostatniego dobrego
      // rozkładu, bo „udało się, ale pusto" bywa samo w sobie objawem awarii.
      if (schedulesOk && routes.length > 0) lastGoodRoutes = routes
      const effectiveRoutes = schedulesOk && routes.length > 0 ? routes : (lastGoodRoutes ?? routes)

      // Pusta lista tras (pobranie rozkładu padło -- patrz `fetchRoutesByTrainId`)
      // musi dojść do statystyk jako `null` („nie wiadomo"), nie jako pusty
      // rozkład („zero pociągów") -- AGENTS.md #7.
      const routesForStats = effectiveRoutes.length === 0 ? null : effectiveRoutes

      // Rozkład jako źródło listy -- patrz `ScheduleSource` w `transform.ts`.
      // `null` zachowuje ścieżkę historyczną (lista z realizacji).
      const scheduleSource =
        (config.boardSource ?? 'operations') === 'schedule'
          ? { routes: effectiveRoutes, todayIsoDate }
          : null

      /**
       * Feed odpowiadający 200, ale bez ani jednego planowego czasu, jest
       * niesprawny — patrz `hasUsablePlannedTimes()`. Sam ten fakt NIE przesądza
       * jednak, że nie mamy co pokazać: od kiedy `transformOperations` odtwarza
       * plan z trasy rozkładowej, tablica potrafi się zbudować z samego
       * `/schedules`, bez realizacji. Dlatego rozstrzygamy dopiero po
       * zbudowaniu snapshotów, nie przed.
       */
      const feedBroken = operationTrains.length > 0 && !hasUsablePlannedTimes(operationTrains)

      recordHealth(diagnostics.operations, true, operationTrains.length, fetchedAt)
      diagnostics.operations.truncatedRefetch = truncatedRefetch
      recordHealth(diagnostics.schedules, schedulesOk, routes.length, fetchedAt)
      diagnostics.schedules.usedFullRouteFallback = usedFullRouteFallback
      recordHealth(diagnostics.disruptions, disruptions.ok, disruptions.disruptions.length, fetchedAt)

      /**
       * Czy realizacja w ogóle wie cokolwiek o DZISIEJSZYM ruchu. `every` na
       * pustej liście daje `true` -- brak odpowiedzi to też brak wiedzy.
       *
       * Odkąd tablica potrafi się zbudować z samego rozkładu, to rozróżnienie
       * decyduje o uczciwości komunikatu: wiersze są, ale żaden nie niesie
       * informacji o opóźnieniu.
       */
      const realizationStale = operationTrains.every((train) => train.operatingDate !== todayIsoDate)

      // „Podejrzanie" to albo feed bez planowych czasów, albo brak choćby
      // jednego pociągu z dzisiejszą datą -- oba stany zaobserwowane podczas
      // awarii z 27-31.08. Nie czekamy na wynik: diagnostyka nie może opóźniać
      // cyklu ani go wywrócić.
      void maybeCheckDataVersion(feedBroken || (operationTrains.length > 0 && realizationStale), fetchedAt)

      // Do mapy pomocniczej, nie od razu do `snapshots` -- dopóki nie wiadomo,
      // czy jest czym nadpisywać, ostatnie dobre dane muszą zostać nietknięte.
      const built = new Map<string, BoardSnapshot>()
      for (const stationId of realActive) {
        built.set(
          stationId,
          transformOperations(
            stationId,
            stationNames.get(stationId) ?? mergedStationNames[stationId] ?? stationId,
            operationTrains,
            mergedStationNames,
            routesByTrainId,
            carrierNames,
            fetchedAt,
            new Date(fetchedAt),
            categoryNames,
            disruptedTrains,
            computeStationStats(stationId, operationTrains, routesForStats, mergedStationNames, todayIsoDate),
            findStationDisruptionMessages(disruptions.disruptions, disruptions.disruptionTypes, stationId),
            scheduleSource
          )
        )
      }

      const builtAnyRow = [...built.values()].some(
        (snapshot) => snapshot.departures.length > 0 || snapshot.arrivals.length > 0
      )

      // Niesprawny feed I nic do pokazania -- jedyny przypadek, w którym
      // nadpisanie byłoby czystą stratą. AGENTS.md #7: zostaje ostatni znany
      // dobry snapshot wraz ze swoim wiekiem (`ageMs` w `/api/board`), nie pustka.
      if (feedBroken && !builtAnyRow) {
        status = 'degraded'
        console.error(
          `Poller: PKP zwróciło ${operationTrains.length} pociągów bez ani jednego planowego czasu i bez dostępnego rozkładu — zachowuję poprzednie dane`
        )
        timer = setTimeout(() => void runTick(), currentIntervalMs)
        return
      }

      for (const [stationId, snapshot] of built) {
        snapshots.set(stationId, snapshot)
      }

      /**
       * Rozkład sam się zbudował, ale realizacji nadal nie ma -- dane są
       * niepełne i UI ma o tym mówić wprost, zamiast pokazywać sam plan jako
       * pełnowartościową prawdę.
       *
       * Drugi warunek dotyczy wyłącznie trybu „rozkład jest źródłem": mamy
       * wtedy komplet wierszy, ale ani jednego opóźnienia, bo realizacja nie
       * zna dzisiejszego dnia. Bez tego tablica wyglądałaby na w pełni sprawną
       * (same statusy „jeszcze nie wyjechał"), co przy pięciodniowej awarii PKP
       * byłoby po prostu nieprawdą.
       */
      diagnostics.realizationStale = realizationStale
      const scheduleOnly = scheduleSource !== null && builtAnyRow && realizationStale
      status = feedBroken || scheduleOnly ? 'degraded' : 'ok'

      // Przeliczone od zera z wyniku TEGO cyklu -- jak tylko śledzony
      // przystanek się potwierdzi (albo zniknie), jego stacja pomocnicza
      // sama wypada z następnego zapytania, bez osobnego wygaszania.
      // `collectUpstreamCandidates` czyta przystanki obserwowanych stacji i
      // trasę z `/schedules` (nie przystanki pomocnicze z `train.stations`),
      // więc `operationTrains` (komplet po ewentualnym dociągnięciu) jest tu
      // właściwym, pełniejszym wejściem.
      auxStationIds = collectUpstreamCandidates(realActive, operationTrains, routesByTrainId)

      // Patrz `NEW_STATION_FOLLOWUP_DELAY_MS` -- tylko gdy ten cykl faktycznie
      // odkrył stacje pomocnicze DLA świeżo dodanej stacji, i budżet na to pozwala.
      // (`budgetLow` i `currentIntervalMs` policzone wyżej, przed bramką
      // sprawdzającą sprawność feedu -- zwolnienie przy niskim budżecie musi
      // działać także wtedy, gdy ten cykl kończy się na `degraded`.)
      scheduleFollowUp = newlyObserved.length > 0 && auxStationIds.size > 0 && !budgetLow
    } catch (err) {
      if (err instanceof PkpApiError && err.status === 401) {
        status = 'configError'
        timer = null
        return
      }
      if (err instanceof PkpApiError && err.status === 429) {
        currentIntervalMs = Math.min(currentIntervalMs * 2, LOW_BUDGET_INTERVAL_MS)
      }
      status = 'degraded'
      diagnostics.operations.ok = false
      console.error('Poller: błąd pobierania operacji', err)
    }

    timer = setTimeout(() => void runTick(), scheduleFollowUp ? NEW_STATION_FOLLOWUP_DELAY_MS : currentIntervalMs)
  }

  /**
   * Pobiera jedno wymuszenie z puli okna kroczącego. `false` znaczy, że pula na
   * to okno jest wyczerpana i żądanie musi poczekać na zwykły przebieg.
   */
  function consumeForcedRun(timestamp: number): boolean {
    const cutoff = timestamp - FORCED_RUN_WINDOW_MS
    forcedRunsAt = forcedRunsAt.filter((at) => at > cutoff)

    if (forcedRunsAt.length >= MAX_FORCED_RUNS_PER_WINDOW) return false

    forcedRunsAt.push(timestamp)
    return true
  }

  function forceRunNow(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
    void runTick()
  }

  return {
    registerInterest(stationIds: string[]): void {
      const wasAsleep = timer === null
      const timestamp = now()
      const hasStationWithoutData = stationIds.some((stationId) => !snapshots.has(stationId))

      for (const stationId of stationIds) {
        // Eksmisja tylko dla faktycznie nowej stacji przy pełnej pojemności --
        // odświeżenie już obserwowanej nigdy nie powiększa `interest`, więc nie
        // ma czego eksmitować. FIFO po kolejności wstawienia (`Map` zachowuje ją
        // z definicji), nie LRU -- ten sam kompromis co `createTtlCache()`.
        if (!interest.has(stationId) && interest.size >= maxWatchedStations) {
          const oldest = interest.keys().next()
          if (oldest.done === false) {
            interest.delete(oldest.value)
            snapshots.delete(oldest.value)
          }
        }
        interest.set(stationId, timestamp)
      }

      // Obudzenie z uśpienia nie zużywa puli: wymaga 5 minut ciszy, więc nie da
      // się go powtarzać w pętli, a pierwszy użytkownik po przerwie nie powinien
      // czekać na kolejny przebieg. `timer` jest tu zawsze `null` (to definicja
      // `wasAsleep`), więc zachowanie jest identyczne jak przy zwykłym
      // wymuszeniu — forceRunNow() obsługuje oba przypadki.
      if (wasAsleep) {
        forceRunNow()
        return
      }

      const sinceLastRun = timestamp - lastRunAt

      if (sinceLastRun >= FORCE_RUN_THROTTLE_MS) {
        forceRunNow()
        return
      }

      if (hasStationWithoutData && consumeForcedRun(timestamp)) {
        forceRunNow()
      }
    },

    getSnapshot(stationId: string): BoardSnapshot | undefined {
      return snapshots.get(stationId)
    },

    getBudget() {
      return budget
    },

    getStatus(): PollerStatus {
      return status
    },

    isAwake(): boolean {
      return timer !== null
    },

    getIntervalMs(): number {
      return currentIntervalMs
    },

    isThrottled(): boolean {
      return currentIntervalMs > config.pollIntervalMs
    },

    getDiagnostics(): PollerDiagnostics {
      // Kopia płytka po polach: konsument (`/api/health`) nie może przypadkiem
      // zmutować stanu pollera, a struktura jest płaska.
      return {
        realizationStale: diagnostics.realizationStale,
        operations: { ...diagnostics.operations },
        schedules: { ...diagnostics.schedules },
        disruptions: { ...diagnostics.disruptions },
        dataVersion: diagnostics.dataVersion === null ? null : { ...diagnostics.dataVersion },
      }
    },
  }
}
