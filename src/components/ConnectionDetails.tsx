'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { DelayBadge, STATUS_TEXT } from './DelayBadge'
import { DelayForecast } from './DelayForecast'
import { CarrierLogo } from './CarrierLogo'
import { PageTitle } from './PageTitle'
import { TrainRouteList } from './TrainRouteList'
import { describeStopTime } from './stopTime'
import { AlertCircleIcon, ArrivalIcon, ArrowRightIcon, CalendarIcon, DepartureIcon, InfoIcon, TimerIcon, TrainIcon, ICON_SIZE } from './icons'
import { resolveStopStatus, type RealizationStatus } from '@/lib/board/realization'
import { resolvePositionAnchor } from '@/lib/board/trainDetail'
import { resolveInterpolatedPosition, type TrainDetailStopWithCoords } from '@/lib/board/mapPosition'
import { MapView, type MapMover, type MapPin } from './MapView'
import { stopDelayMinutes, summariseJourney } from '@/lib/board/journey'
import { pluralPl } from '@/lib/plural'
import { formatAgo, formatClockTime, formatDuration } from '@/lib/format'
import { countdownLabel } from '@/lib/countdown'
import { NAV_FORWARD_TYPES } from '@/lib/navTransition'
import { usePolling } from '@/hooks/usePolling'
import { useStationWeather } from '@/hooks/useStationWeather'
import { useScrollableFocus } from '@/hooks/useScrollableFocus'
import { AsideCard } from './aside'
import { WeatherCard } from './StationAside'

type TrainDetailApiResponse = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainStatus: string | null
  carrierCode: string | null
  carrierName: string | null
  category: string | null
  categoryName: string | null
  routeName: string | null
  nationalNumber: string | null
  stops: TrainDetailStopWithCoords[]
}

type Props = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainLabel: string
  /**
   * Wywoływane z ostatecznym numerem pociągu, gdy `/api/train` odpowie — dla
   * rodzica renderującego breadcrumb NAD tym komponentem, żeby nie utknął na
   * tymczasowym `trainLabel` z linku po wczytaniu prawdziwych danych (ten sam
   * powód co `onNameResolved` w `TransitStopDetail`).
   */
  onLabelResolved?: (label: string) => void
}

type Status = 'loading' | 'error' | 'ready'

/**
 * Pociąg, który dojechał do ostatniego przystanku (albo ma całą trasę
 * odwołaną), już się nie zmieni. Jedna implementacja (AGENTS.md: jedna
 * implementacja na regułę domenową) — używana zarówno przez pętlę
 * dociągania w tle (nie ma czego dociągać dalej), jak i przez wskaźnik
 * wieku danych w nagłówku (skończona podróż nie oczekuje odświeżenia,
 * więc „Dane sprzed N min" byłoby szumem, nie informacją).
 */
function isJourneyOver(stops: TrainDetailStopWithCoords[]): boolean {
  if (stops.length === 0) return false
  return stops[stops.length - 1].isConfirmed || stops.every((stop) => stop.isCancelled)
}

/** Odświeżanie samego odliczania „za ile" — bez żadnego zapytania do PKP (AGENTS.md #3). */
const COUNTDOWN_TICK_MS = 30_000

/**
 * Odstęp między odświeżeniami `/api/train` w tle -- tylko gdy karta jest
 * widoczna (pauzę na ukrytej karcie i wznowienie po powrocie robi `usePolling`)
 * i pociąg jeszcze jedzie. Cache `/api/train` po stronie serwera trzyma 90 s,
 * więc częściej nie ma sensu pytać PKP (AGENTS.md #3).
 */
const BACKGROUND_REFRESH_MS = 5 * 60_000

/** Blok szkieletu — ten sam wzór co `PageSkeleton.tsx` (jednorazowy puls, bez własnych animacji). */
const SKELETON_BLOCK = 'animate-pulse rounded bg-black/5 dark:bg-white/5'

/** Komunikat, gdy serwer nie podał własnego (błąd sieci, nie-JSON, 5xx bez treści). */
const GENERIC_ERROR = 'Nie udało się pobrać szczegółów połączenia.'

/**
 * Jedno pobranie `/api/train`. Błąd niesie komunikat SERWERA (np. limit
 * godzinowy PKP, route.ts) albo `GENERIC_ERROR` -- `usePolling` przekazuje
 * `Error.message` dalej, więc przeżywa ponowienia w tle. `background=1`
 * dostaje tylko dociąganie w tle, nigdy pierwsze wczytanie: serwer rezerwuje
 * ostatnie sloty godzinowego limitu wyłącznie dla żądań BEZ tego parametru.
 */
async function fetchTrainDetail(
  scheduleId: string,
  orderId: string,
  operatingDate: string,
  background: boolean
): Promise<TrainDetailApiResponse> {
  const params = new URLSearchParams({ scheduleId, orderId, operatingDate })
  if (background) params.set('background', '1')
  const response = await fetch(`/api/train?${params}`).catch(() => null)
  if (response === null) throw new Error(GENERIC_ERROR)
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const serverMessage =
      body !== null && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : null
    throw new Error(serverMessage ?? GENERIC_ERROR)
  }
  const json: unknown = await response.json().catch(() => null)
  if (json === null) throw new Error(GENERIC_ERROR)
  return json as TrainDetailApiResponse
}

const formatTime = formatClockTime

/** `2026-08-27` → `27.08.2026 (czw.)`. Sama data kalendarzowa, nie znacznik czasu — nie przechodzi przez `normalizeApiTimestamp`. */
function formatOperatingDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return null
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return null
  const weekday = date.toLocaleDateString('pl-PL', { weekday: 'short' })
  return `${day}.${month}.${year} (${weekday})`
}

/** `null`/ujemne minuty → `null` (nie ma czego pokazać); reszta deleguje do wspólnego `formatDuration`. */
function formatDurationOrNull(minutes: number | null): string | null {
  return minutes === null || minutes < 0 ? null : formatDuration(minutes)
}


function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold tracking-[0.13em] text-text-muted uppercase">{children}</h2>
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-sm text-text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}

function MetaItem({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string | null
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-text-muted">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs tracking-[0.08em] text-text-muted uppercase">{label}</div>
        <div className="mt-0.5 font-medium text-foreground tabular-nums">{value}</div>
        {hint !== null && hint !== undefined && <div className="truncate text-xs text-text-secondary">{hint}</div>}
      </div>
    </div>
  )
}

export function ConnectionDetails({ scheduleId, orderId, operatingDate, trainLabel, onLabelResolved }: Props) {
  const [asideRef, asideTabIndex] = useScrollableFocus<HTMLElement>()
  // Wejście = fetch, a potem dociąganie co `BACKGROUND_REFRESH_MS` na widocznej
  // karcie (AGENTS.md #3) -- inaczej marker „Pociąg jest tutaj", opóźnienia i
  // statusy zostałyby zamrożone z chwili wczytania. Cichy tryb w tle: bez
  // szkieletu, a błąd nie gasi działającej strony (#7). Kończy się, gdy pociąg
  // dojedzie do stacji końcowej (`isDone`). Powrót na kartę odświeża tylko
  // wtedy, gdy tik minął w ukryciu -- zero fokusa okna, zero dodatkowego kosztu.
  const { data, error, lastSuccessAt, refresh } = usePolling<TrainDetailApiResponse>(
    JSON.stringify([scheduleId, orderId, operatingDate]),
    ({ background }) => fetchTrainDetail(scheduleId, orderId, operatingDate, background),
    { refreshMs: BACKGROUND_REFRESH_MS, isDone: (json) => isJourneyOver(json.stops), cacheNamespace: 'train' }
  )
  // Baner błędu tylko wtedy, gdy nie mamy jeszcze CZEGO pokazać. Nieudany
  // refetch (dowolny status, w tym 503 limitu) zostawia ostatni dobry stan,
  // CICHO (AGENTS.md #7) -- ale „cicho" ≠ „bez śladu": `backgroundRefreshFailed`
  // pozwala wskaźnikowi wieku pokazać się zaraz po nieudanej próbie, gdy dane
  // wg zegara są jeszcze świeże.
  const status: Status = data !== null ? 'ready' : error !== null ? 'error' : 'loading'
  const backgroundRefreshFailed = data !== null && error !== null
  const [now, setNow] = useState(() => Date.now())
  // Skrót długiej trasy: stan LOKALNY (nie dotyka `usePolling`) — rozwinięcie, zwinięcie i odświeżenie w tle nie
  // robią żadnego zapytania (#3), a rozwinięta lista przeżywa kolejne odpowiedzi.
  const [routeExpanded, setRouteExpanded] = useState(false)
  // Pogoda punktu startu trasy — `stops[0]` to stacja początkowa (`stationId`
  // to identyfikator PKP, ten sam, którym kluczuje `/api/weather`). Pusty ciąg
  // przed odpowiedzią = hook nie bije w API (AGENTS.md #3).
  const originWeather = useStationWeather(data?.stops[0]?.stationId ?? '')

  // Każda próba (udana lub nie) odświeża `now`, żeby wiek danych liczył się od
  // chwili próby, nie od ostatniego tiku zegara odliczania (patrz niżej).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizacja zegara z zewnętrznym zdarzeniem (wynik odpytania), nie stan pochodny
    setNow(Date.now())
  }, [lastSuccessAt, error])

  // Własny zegar wyłącznie na potrzeby „za ile" w nagłówku. `/api/train` odświeża się
  // co 5 min tylko na widocznej karcie (AGENTS.md #3), więc między odświeżeniami
  // odliczanie bez tego stałoby w miejscu i kłamało o minuty.
  // Zero kosztu wobec PKP: to sam `Date.now()`, nie odpytanie.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  // Status per przystanek, policzony raz z `resolveStopStatus` — jedyne źródło
  // koloru zarówno dla `DelayBadge` w wierszu, jak i dla znacznika/odcinka
  // toru w stepperze niżej. Żadnej drugiej, równoległej logiki. `nowDate`
  // liczone raz na render (nie w map), żeby wszystkie wiersze — i nagłówek —
  // miały ten sam punkt odniesienia dla „plan dawno minął"
  // (patrz `resolveStopStatus`, `STALE_UNCONFIRMED_MS`).
  // useMemo (nie zwykła `??`): mapPins/mapMovers niżej zależą od tożsamości
  // `stops` -- bez tego React Compiler nie może dowieść, że `data?.stops ?? []`
  // jest stabilne między renderami (tick zegara `now` co 30s renderuje na nowo,
  // ale `data` się nie zmienia), i odmawia memoizacji tamtych hooków.
  const stops = useMemo<TrainDetailStopWithCoords[]>(() => data?.stops ?? [], [data?.stops])
  const nowDate = new Date(now)
  // Pociąg bez ŻADNEJ realizacji, który wg rozkładu właśnie jedzie: pokazujemy
  // szacowaną pozycję i status „w trasie" z jawnym zastrzeżeniem (patrz
  // `isScheduleProjection`, plan „trains-schedule-position"). Pociąg Z
  // potwierdzeniami, ale PRZETERMINOWANYMI (gęste linie SKM/KM/WKD potwierdzają
  // paczkami z opóźnieniem) idzie z projekcji rozkładowej kotwiczonej w ostatnim
  // potwierdzeniu (patrz `isStalePositionProjection`). Wybór trybu i indeksu —
  // `resolvePositionAnchor` (trainDetail.ts) — WSPÓLNY z markerem na mapie
  // (`mapPosition.ts`), żeby oś i mapa nigdy nie pokazały dwóch różnych pozycji.
  const positionAnchor = resolvePositionAnchor(stops, data?.trainStatus ?? null, nowDate)
  const scheduleMode = positionAnchor.mode === 'schedule'
  const currentStopIndex = positionAnchor.index
  const stopStatuses = stops.map((stop, index) =>
    resolveStopStatus({
      isCancelled: stop.isCancelled,
      isConfirmed: stop.isConfirmed,
      delayMinutes: stopDelayMinutes(stop),
      // W trybie rozkładowym każdy przystanek do bieżącego włącznie liczy się
      // jako „pociąg tu już był" → `enRoute` zamiast `notStarted`/`unknown`.
      hasTrainStarted: stop.hasTrainStarted || (scheduleMode && index <= currentStopIndex),
      plannedAt: stop.plannedDeparture ?? stop.plannedArrival,
      now: nowDate,
    })
  )
  const summary = summariseJourney(stops, { now: nowDate })
  // Nagłówek i wykres prognozy idą tą samą ścieżką co wiersze: w trybie
  // rozkładowym „w trasie", inaczej wynik `summariseJourney` bez zmian.
  const overallStatus: RealizationStatus = scheduleMode ? 'enRoute' : summary.overallStatus

  // Utrudnienia zebrane z całej trasy — jedno utrudnienie potrafi dotyczyć
  // wielu przystanków, więc bez deduplikacji baner powtarzałby ten sam tekst.
  const routeDisruptions = [...new Set(stops.flatMap((stop) => stop.disruptionMessages ?? []))]

  // „Pobrano {N} temu": ZAWSZE widoczne, gdy mamy dane (AGENTS.md #7: wiek rośnie widocznie, nigdy się nie
  // chowa). To chwila pobrania przez PRZEGLĄDARKĘ (`lastSuccessAt`), nie wiek źródła -- odpowiedź PKP nie
  // niesie czasu źródła. Kolor ostrzegawczy: ostatnia próba w tle padła (`backgroundRefreshFailed`: wtedy też
  // „Spróbuj ponownie") ALBO dane starsze niż 2×BACKGROUND_REFRESH_MS (np. karta po przerwie). Skończona
  // podróż (`isJourneyOver`, ten sam warunek co zatrzymanie dociągania) nie oczekuje odświeżenia -- zawsze neutralnie.
  const journeyOver = isJourneyOver(stops)
  const dataAgeSec = lastSuccessAt !== null ? Math.max(0, Math.floor((now - lastSuccessAt) / 1000)) : null
  const refreshFailed = backgroundRefreshFailed && !journeyOver
  const ageWarning = !journeyOver && (refreshFailed || (dataAgeSec !== null && dataAgeSec * 1000 >= 2 * BACKGROUND_REFRESH_MS))

  // Mapa trasy: tylko przystanki z rzeczywistymi współrzędnymi (AGENTS.md #6 —
  // reszta po prostu nie dostaje pina, polilinia łączy się dłuższym odcinkiem
  // do następnego punktu, bez dashed-line/nowego stanu w MapView). Marker
  // zawsze podpisany jako szacowany (AGENTS.md #7) -- `resolveInterpolatedPosition`
  // nigdy nie zwraca "pewnej" pozycji.
  const { resolvedTheme } = useTheme()
  const mapPins = useMemo<MapPin[]>(
    () =>
      stops.reduce<MapPin[]>((pins, stop, index) => {
        if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') return pins
        pins.push({ id: `${stop.stationId}-${index}`, lat: stop.lat, lon: stop.lon, label: stop.stationName, mode: 'rail' })
        return pins
      }, []),
    [stops]
  )
  const mapRoute = useMemo(
    () => ({ points: mapPins.map(({ lat, lon }) => ({ lat, lon })), mode: 'rail' as const, kind: 'regular' as const }),
    [mapPins]
  )
  const mapMovers = useMemo<MapMover[]>(() => {
    const position = resolveInterpolatedPosition(stops, data?.trainStatus ?? null, new Date(now))
    return position === null
      ? []
      : [{ id: 'train', lat: position.lat, lon: position.lon, label: 'Szacowana pozycja', mode: 'rail' as const, kind: 'regular' as const, glyph: 'train' as const }]
  }, [stops, data?.trainStatus, now])

  const categoryLabel = data?.category ?? null
  const trainNumber =
    categoryLabel !== null && data?.nationalNumber
      ? `${categoryLabel} ${data.nationalNumber}`
      : (data?.nationalNumber ?? data?.routeName ?? trainLabel)
  // Nazwa własna pociągu tylko wtedy, gdy nie jest już całym tytułem —
  // „WARTA" pod nagłówkiem „WARTA" to nie informacja, to powtórzenie.
  const routeNameSuffix = data?.routeName !== null && data?.routeName !== undefined && data.routeName !== trainNumber ? data.routeName : null

  useEffect(() => {
    if (status === 'ready') onLabelResolved?.(trainNumber)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onLabelResolved` to callback rodzica, nie stan śledzony tu
  }, [status, trainNumber])

  // Przyjazd do celu z tego samego helpera co wiersze trasy (`describeStopTime` → `timePresentation`, #2):
  // fakt / prognoza / plan z podpisem, nie surowy `displayAt`.
  const lastIndex = stops.length - 1
  const destinationTime = lastIndex >= 0 ? describeStopTime(stops[lastIndex], stopStatuses[lastIndex], now, 'arrival') : null
  const destinationAt = destinationTime?.at ?? null
  const arrivalTime = formatTime(destinationAt)
  // Bez sufitu godziny: do celu podróży „za 2 h 5 min” ma sens (wspólne odliczanie, `lib/countdown.ts`).
  // Odwołany cel nie odlicza.
  const countdown =
    destinationAt === null || stopStatuses[lastIndex] === 'cancelled' ? null : countdownLabel(now, destinationAt, Infinity)
  const travelTime = formatDurationOrNull(summary.plannedDurationMinutes)

  return (
    <div className="flex flex-col gap-6">
      {status === 'loading' && (
        // Szkielet nagłówka i osi (jak `PageSkeleton`): bloki są dekoracją, czytnik dostaje jedno zdanie.
        <div data-testid="connection-loading" aria-busy="true" className="glass rounded-2xl p-4 sm:p-6">
          <PageTitle>{trainLabel}</PageTitle>
          <span className="sr-only">Wczytywanie trasy…</span>
          <div aria-hidden="true" className={`${SKELETON_BLOCK} mt-3 h-6 w-3/4 max-w-md`} />
          <div aria-hidden="true" className={`${SKELETON_BLOCK} mt-3 h-8 w-32`} />
          <div className="mt-5 flex flex-col gap-4 border-t border-surface-border pt-4">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <div aria-hidden="true" className={`${SKELETON_BLOCK} h-3 w-3 shrink-0 rounded-full`} />
                <div aria-hidden="true" className={`${SKELETON_BLOCK} h-5 w-2/5`} />
                <div aria-hidden="true" className={`${SKELETON_BLOCK} ml-auto h-5 w-16`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="glass rounded-2xl p-4 sm:p-6">
          {/* Każdy stan ma jeden h1 — etykieta z linku, jak przy wczytywaniu. */}
          <PageTitle className="mb-2">{trainLabel}</PageTitle>
          <p role="alert" className="text-sm font-medium text-error-text">
            {error}
          </p>
          {/* Komunikat serwera (np. limit godzinowy PKP, 404) już mówi, co zrobić --
              drugi generyczny akapit dublowałby to, albo sugerowałby, że
              odświeżenie strony pomoże, gdy w rzeczywistości trafi w ten sam limit. */}
          {error === GENERIC_ERROR && (
            <p className="mt-1 text-sm text-text-secondary">
              Ten widok pobiera dane przy każdym otwarciu i nie ma zapisanej wcześniejszej wersji do pokazania. Spróbuj
              odświeżyć stronę.
            </p>
          )}
          {/* Ręczne ponowienie = jedyna nowa ścieżka wywołania: pierwszoplanowe `refresh()` po kliknięciu
              (no-op w trakcie pobierania), nigdy automatyczne (#3). */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={refresh} className="btn-primary control-44">
              Spróbuj ponownie
            </button>
            <Link href="/search" transitionTypes={NAV_FORWARD_TYPES} className="chip-filter control-44">
              Szukaj stacji
            </Link>
          </div>
        </div>
      )}

      {/* Odpowiedź przyszła, ale PKP nie zwróciło listy przystanków (legalne:
          `stations` bywa `null`). To nie awaria pobierania — inny komunikat niż
          `status === 'error'` (AGENTS.md #7: „brak wyników" ≠ „nie udało się
          sprawdzić"). */}
      {status === 'ready' && data !== null && data.stops.length === 0 && (
        <div className="glass rounded-2xl p-6">
          <p role="alert" className="text-sm text-text-muted">
            PKP nie udostępnia teraz trasy tego połączenia.
          </p>
        </div>
      )}

      {status === 'ready' && data !== null && data.stops.length > 0 && (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_var(--spacing-aside)]">
          {/* Nagłówek + przebieg trasy w jednej kolumnie (`col-start-1`), prawy pasek
              w drugiej i przez oba wiersze — dzięki temu widżety zaczynają się od
              samej góry, a karta nagłówka ma szerokość listy przystanków. */}
          {/* ── Nagłówek ─────────────────────────────────────────────── */}
          <header className="glass @container rounded-2xl p-4 sm:p-6 xl:col-start-1 xl:row-start-1">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  {categoryLabel !== null && (
                    <span
                      className="rounded-lg px-2 py-1 text-xs font-bold tracking-wide text-white"
                      style={{ backgroundColor: 'var(--accent-solid)' }}
                      title={data.categoryName ?? undefined}
                    >
                      {categoryLabel}
                    </span>
                  )}
                  <PageTitle>{trainNumber}</PageTitle>
                  {data.carrierCode !== null && <CarrierLogo carrierCode={data.carrierCode} size={ICON_SIZE.tile} />}
                  <span className="text-sm text-text-secondary">{data.carrierName ?? data.carrierCode ?? ''}</span>
                  {routeNameSuffix !== null && <span className="text-sm font-medium text-text-muted">· {routeNameSuffix}</span>}
                </div>
                {summary.origin !== null && summary.destination !== null && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold text-foreground sm:text-xl">
                    <span>{summary.origin.stationName}</span>
                    <ArrowRightIcon size={ICON_SIZE.tile} label="do" className="text-text-muted" />
                    <span>{summary.destination.stationName}</span>
                  </p>
                )}
                {/* Jedna linia daty na każdej szerokości (też, gdy to nie dziś -- bez „dziś"). */}
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-text-secondary">
                  <CalendarIcon size={ICON_SIZE.inline} className="shrink-0 text-text-muted" />
                  {formatOperatingDate(data.operatingDate) ?? data.operatingDate}
                </p>
                {dataAgeSec !== null && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {/* Bez `aria-live`: licznik tyka co 30 s, to nie komunikat dla czytnika. */}
                    <p data-testid="data-age" className={`text-xs ${ageWarning ? 'text-warning-text' : 'text-text-muted'}`}>
                      {refreshFailed && 'Nie udało się odświeżyć — pokazujemy ostatnie dane · '}Pobrano {formatAgo(dataAgeSec)}
                    </p>
                    {refreshFailed && (
                      <button type="button" onClick={refresh} className="chip-filter control-44">
                        Spróbuj ponownie
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-5">
                {/* Badge całej podróży: `notStarted` -> „jeszcze nie wyjechał"
                    (kierunek domyślny). Dla nagłówka to informacja („pociąg
                    jeszcze nie ruszył"), a nie truizm „nie przyjechał"; ten
                    drugi ma sens tylko na ostatnim przystanku steppera niżej. */}
                <div className="flex flex-col items-start gap-1">
                  <DelayBadge
                    status={overallStatus}
                    delayMinutes={summary.arrivalDelayMinutes}
                    estimatedDelayMinutes={summary.estimatedArrivalDelayMinutes}
                  />
                  {/* Dotykowy odpowiednik podpowiedzi (`title`) na plakietce szacunku. */}
                  {overallStatus === 'enRoute' && typeof summary.estimatedArrivalDelayMinutes === 'number' && (
                    <p className="max-w-64 text-xs text-text-muted">
                      Szacunek z ostatniego potwierdzenia — może się zmienić na dalszej trasie.
                    </p>
                  )}
                </div>
                {arrivalTime !== null && destinationTime !== null && (
                  <div data-testid="arrival-block" className="text-left sm:text-right">
                    <div className="text-xs tracking-[0.08em] text-text-muted uppercase">Przyjazd do celu</div>
                    <div
                      className="time-dominant text-foreground sm:font-heading sm:text-3xl sm:font-bold"
                      style={destinationTime.kind === 'plan' ? undefined : { color: STATUS_TEXT[stopStatuses[lastIndex]] }}
                    >
                      {arrivalTime}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {destinationTime.label === 'Przew.' ? <abbr title="Przewidywana">Przew.</abbr> : <span>{destinationTime.label}</span>}
                      {destinationTime.planAt !== null && ' '}
                      {destinationTime.planAt !== null && <span>{`· Plan ${formatTime(destinationTime.planAt)}`}</span>}
                    </div>
                    {countdown !== null && <div className="text-sm text-text-secondary">{countdown}</div>}
                  </div>
                )}
              </div>
            </div>

            {/* Telefon czyta to z wierszy trasy i z „Informacji o połączeniu" -- siatka od `sm`. */}
            <div
              data-testid="connection-meta"
              className="mt-5 grid gap-4 border-t border-surface-border pt-4 text-sm max-sm:hidden @md:grid-cols-3"
            >
              <MetaItem
                icon={<DepartureIcon size={ICON_SIZE.button} />}
                label="Odjazd (plan)"
                value={formatTime(summary.origin?.plannedAt ?? null) ?? '—'}
                hint={summary.origin?.stationName ?? null}
              />
              <MetaItem
                icon={<ArrivalIcon size={ICON_SIZE.button} />}
                label="Przyjazd (plan)"
                value={formatTime(summary.destination?.plannedAt ?? null) ?? '—'}
                hint={summary.destination?.stationName ?? null}
              />
              <MetaItem
                icon={<TimerIcon size={ICON_SIZE.button} />}
                label="Czas podróży"
                value={travelTime ?? '—'}
                hint={`${summary.stopCount} ${pluralPl(summary.stopCount, 'przystanek', 'przystanki', 'przystanków')}`}
              />
            </div>
          </header>

          {/* `contents`: ten div znika z drzewa układu, a jego dzieci (kolumna
              trasy i prawy pasek) trafiają wprost do siatki wyżej — bez tego
              trzeba by przesunąć wcięcie całej sekcji trasy o jeden poziom. */}
          <div className="contents">
            {/* ── Przebieg trasy ─────────────────────────────────────── */}
            <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-2">
              {/* Tryb rozkładowy: PKP nie potwierdza nic na tej trasie, a wg
                  rozkładu pociąg jedzie. Pozycja i „w trasie" niżej są wtedy
                  projekcją z rozkładu — trzeba to powiedzieć wprost. */}
              {scheduleMode && (
                <div className="glass flex items-start gap-3 rounded-2xl p-4">
                  <span className="mt-0.5 shrink-0 text-text-muted">
                    <InfoIcon size={ICON_SIZE.button} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">Brak potwierdzeń przejazdu z PKP.</p>
                    <p className="text-sm text-text-secondary">
                      Pozycja i status „w trasie” są szacowane z rozkładu. Jeśli pociąg został odwołany, nie zobaczysz
                      tego tutaj.
                    </p>
                  </div>
                </div>
              )}
              <section className="glass rounded-2xl p-5 sm:p-6">
                <SectionHeading>Przebieg trasy</SectionHeading>
                <TrainRouteList
                  stops={data.stops}
                  statuses={stopStatuses}
                  anchor={positionAnchor}
                  now={now}
                  expanded={routeExpanded}
                  onToggle={() => setRouteExpanded((value) => !value)}
                />
              </section>

              {mapPins.length >= 2 && (
                <section className="glass rounded-2xl p-4">
                  <h2 className="mb-3 text-sm font-bold text-foreground">Mapa trasy</h2>
                  <MapView pins={mapPins} route={mapRoute} movers={mapMovers} ariaLabel={`Mapa trasy pociągu ${trainNumber}`} dark={resolvedTheme === 'dark'} />
                  {/* Etykieta „szacowane" na samym popupie markera (klik) nie
                      wystarcza (AGENTS.md #7) -- kropka rusza się po mapie i bez
                      podpisu widocznego OD RAZU wygląda jak realny GPS. */}
                  {mapMovers.length > 0 && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                      <TrainIcon size={ICON_SIZE.inline} className="shrink-0" />
                      Szacowana pozycja — wg rozkładu i ostatniego potwierdzenia, nie GPS.
                    </p>
                  )}
                </section>
              )}

              {/* Baner utrudnień: „brak wyników" i „nie udało się sprawdzić" to dwa
                  różne komunikaty (AGENTS.md #7) — ten mówi wyłącznie to pierwsze.
                  Awaria pobrania ma własny komunikat wyżej. */}
              {routeDisruptions.length === 0 ? (
                <div className="glass flex items-start gap-3 rounded-2xl p-4">
                  <span className="mt-0.5 shrink-0 text-text-muted">
                    <InfoIcon size={ICON_SIZE.button} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">Aktualnie brak utrudnień na trasie.</p>
                    <p className="text-sm text-text-secondary">
                      Nie zgłoszono żadnych utrudnień dla przystanków tego przejazdu.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="glass flex items-start gap-3 rounded-2xl p-4">
                  <span className="mt-0.5 shrink-0 text-warning-text">
                    <AlertCircleIcon size={ICON_SIZE.button} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {routeDisruptions.length}{' '}
                      {pluralPl(routeDisruptions.length, 'utrudnienie', 'utrudnienia', 'utrudnień')} na trasie
                    </p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {routeDisruptions.map((message) => (
                        <li key={message} className="text-sm text-text-secondary">
                          {message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* ── Prawa kolumna ──────────────────────────────────────── */}
            {/* `tabIndex`/`aria-label`: od `xl` kolumna bywa przewijalna (`xl:overflow-y-auto`), a nie ma w niej
                fokusowalnej treści — axe `scrollable-region-focusable`; fokusowalna tylko, gdy faktycznie się przewija. */}
            <aside ref={asideRef} tabIndex={asideTabIndex} aria-label="Podsumowanie połączenia" className="flex flex-col gap-6 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:sticky xl:top-6 xl:max-h-[calc(100dvh_-_3rem)] xl:overflow-y-auto">
              <AsideCard title={`Pogoda dziś — ${data.stops[0].stationName}`}>
                <WeatherCard weather={originWeather} />
              </AsideCard>

              <section className="glass rounded-2xl p-5">
                <SectionHeading>Informacje o połączeniu</SectionHeading>
                <dl className="mt-2 divide-y divide-surface-border">
                  <InfoRow label="Przewoźnik" value={data.carrierName ?? data.carrierCode ?? '—'} />
                  <InfoRow
                    label="Kategoria"
                    value={
                      data.categoryName !== null && data.category !== null
                        ? `${data.categoryName} (${data.category})`
                        : (data.categoryName ?? data.category ?? '—')
                    }
                  />
                  <InfoRow label="Numer pociągu" value={<span className="tabular-nums">{data.nationalNumber ?? '—'}</span>} />
                  {routeNameSuffix !== null && <InfoRow label="Nazwa pociągu" value={routeNameSuffix} />}
                  <InfoRow label="Czas przejazdu" value={<span className="tabular-nums">{travelTime ?? '—'}</span>} />
                  <InfoRow label="Liczba przystanków" value={<span className="tabular-nums">{summary.stopCount}</span>} />
                  {/* Ukryte, dopóki nie ma ani jednego potwierdzonego przystanku —
                      „0 z 0 punktualnie" brzmi jak zła wiadomość, a znaczy tylko
                      „pociąg jeszcze nie ruszył". */}
                  {summary.punctuality !== null && (
                    <InfoRow
                      label="Punktualnie dotąd"
                      value={
                        <span className="tabular-nums">
                          {summary.punctuality.onTime} z {summary.punctuality.total}
                        </span>
                      }
                    />
                  )}
                </dl>
              </section>

              <section className="glass rounded-2xl p-5">
                <SectionHeading>Prognoza do celu</SectionHeading>
                <DelayForecast
                  series={summary.delaySeries}
                  arrivalTime={arrivalTime}
                  arrivalStatus={overallStatus}
                  className="mt-4"
                />
              </section>
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}
