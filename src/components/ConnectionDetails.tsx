'use client'

import { useEffect, useRef, useState } from 'react'
import { DelayBadge, STATUS_TEXT } from './DelayBadge'
import { DelayForecast } from './DelayForecast'
import { CarrierLogo } from './CarrierLogo'
import { AlertCircleIcon, CalendarIcon, ClockIcon, InfoIcon, LinkIcon, PauseIcon, RouteIcon, ShareIcon, TrainIcon } from './icons'
import { resolveStopStatus, type RealizationStatus } from '@/lib/board/realization'
import { isScheduleProjection, resolveCurrentStopIndex, resolveScheduledStopIndex, type TrainDetailStop } from '@/lib/board/trainDetail'
import { stopDelayMinutes, summariseJourney } from '@/lib/board/journey'
import { pluralPl } from '@/lib/plural'
import { formatClockTime } from '@/lib/format'
import { useShareUrl } from '@/hooks/useShareUrl'

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
  stops: TrainDetailStop[]
}

type Props = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainLabel: string
}

type Status = 'loading' | 'error' | 'ready'

// Kolor znacznika/odcinka toru per status — te same pary kolor/token co
// `DelayBadge` (src/app/globals.css, decyzja #1.1), żeby stepper i plakietka
// obok nigdy nie mogły pokazać dwóch różnych kolorów dla tego samego statusu.
/**
 * „peron 3 · tor 1", sam peron albo sam tor — puste, gdy nie znamy żadnego.
 *
 * Peron i tor są dwiema niezależnymi wartościami (jedna bywa znana bez
 * drugiej), więc nie sklejamy ich w „3/1" — z takiego zapisu nie da się
 * odczytać, której z nich brakuje. Jeden ciąg, nie trzy wyrażenia JSX obok
 * siebie: te renderują się jako osobne węzły tekstowe i rozbijają zarówno
 * zaznaczanie tekstu, jak i odczyt przez czytnik ekranu.
 */
function formatPlatformTrack(platform: string | null, track: string | null): string {
  return [platform !== null ? `peron ${platform}` : null, track !== null ? `tor ${track}` : null]
    .filter((part) => part !== null)
    .join(' · ')
}

const STOP_COLOR: Record<RealizationStatus, string> = {
  onTime: 'var(--status-onTime-bg)',
  delayed: 'var(--status-delayed-bg)',
  cancelled: 'var(--status-cancelled-bg)',
  unknown: 'var(--status-unknown-bg)',
  notStarted: 'var(--status-notStarted-bg)',
  enRoute: 'var(--status-enRoute-bg)',
}

/** Ten sam wzorzec zastrzeżenia co `ESTIMATE_TOOLTIP` w `DelayBadge.tsx` — inne źródło (godzina wprost z PKP dla TEGO przystanku), ta sama ostrożność. */
const PREDICTED_TIME_TOOLTIP =
  'Przewidywana godzina na podstawie danych PKP dla tego przystanku — może się różnić od faktycznej.'

/**
 * Próg, od którego postój dostaje własną plakietkę. Na żywym API (475 tras,
 * 8380 przystanków) 4880 z 7173 postojów trwa dokładnie minutę — plakietka bez
 * progu wisiałaby przy prawie każdym wierszu i przestałaby cokolwiek znaczyć.
 * Pokazujemy tylko postoje, przy których pasażer realnie ma co zrobić.
 */
const NOTABLE_STOP_MINUTES = 3

/** Odświeżanie samego odliczania „za ile" — bez żadnego zapytania do PKP (AGENTS.md #3). */
const COUNTDOWN_TICK_MS = 30_000

/**
 * Najkrótszy odstęp między pobraniami `/api/train` w tle. Poniżej tego i tak
 * trafiłoby w 90 s cache trasy po stronie serwera (`src/app/api/train/route.ts`),
 * więc szybciej nie ma po co pytać PKP (AGENTS.md #3).
 */
const MIN_BACKGROUND_REFRESH_MS = 90_000

/**
 * Powolny timer dociągania danych w tle — tylko gdy karta jest widoczna i pociąg
 * jeszcze jedzie. Rzadki, bo główny sygnał to powrót na kartę / focus okna; ten
 * timer łapie tylko przypadek „patrzę na stronę bez przerwy 10+ min".
 */
const BACKGROUND_REFRESH_MS = 5 * 60_000

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

function formatDuration(minutes: number | null): string | null {
  if (minutes === null || minutes < 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} h`
  return `${hours} h ${rest} min`
}

/** `null` = nie ma czego odliczać (brak godziny albo już po). Świadomie nie pokazujemy ujemnych „za −5 min". */
function formatCountdown(targetIso: string | null, now: number): string | null {
  if (targetIso === null) return null
  const minutes = Math.round((new Date(targetIso).getTime() - now) / 60_000)
  if (minutes < 1) return null
  return `za ${formatDuration(minutes)}`
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold tracking-[0.13em] text-text-muted uppercase">{children}</h2>
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
        <div className="text-[11px] tracking-[0.08em] text-text-muted uppercase">{label}</div>
        <div className="mt-0.5 font-medium text-foreground tabular-nums">{value}</div>
        {hint !== null && hint !== undefined && <div className="truncate text-xs text-text-secondary">{hint}</div>}
      </div>
    </div>
  )
}

export function ConnectionDetails({ scheduleId, orderId, operatingDate, trainLabel }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<TrainDetailApiResponse | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const { share, copied } = useShareUrl()
  // Do sprawdzenia „czy jest jeszcze co odświeżać" wewnątrz efektu bez trzymania
  // `data` w jego zależnościach — inaczej każdy refetch przepinałby listenery.
  const dataRef = useRef<TrainDetailApiResponse | null>(null)

  // Wejście = jednorazowy fetch, a strona żyje potem tylko licznikiem „za ile"
  // (AGENTS.md #3) — więc marker „Pociąg jest tutaj", opóźnienia i statusy
  // zostają zamrożone z chwili wczytania. Dociągamy je w tle: przy powrocie na
  // kartę / focusie okna oraz powolnym timerem, ale nie częściej niż co
  // `MIN_BACKGROUND_REFRESH_MS` (cache `/api/train` i tak trzyma 90 s) i nie po
  // dojechaniu pociągu do stacji końcowej. Odświeżenie w tle jest CICHE — nie
  // pokazuje szkieletu i nie wygasza działającej strony przy błędzie (#7).
  useEffect(() => {
    let cancelled = false
    let lastFetchAt = 0

    async function load(mode: 'initial' | 'background'): Promise<void> {
      if (mode === 'background' && Date.now() - lastFetchAt < MIN_BACKGROUND_REFRESH_MS) return
      lastFetchAt = Date.now()
      try {
        const params = new URLSearchParams({ scheduleId, orderId, operatingDate })
        const response = await fetch(`/api/train?${params}`)
        if (!response.ok) throw new Error(`Błąd odpowiedzi: ${response.status}`)
        const json = (await response.json()) as TrainDetailApiResponse
        if (cancelled) return
        dataRef.current = json
        setData(json)
        setStatus('ready')
      } catch {
        // Baner błędu tylko wtedy, gdy nie mamy jeszcze CZEGO pokazać. Nieudany
        // refetch zostawia ostatni dobry stan (AGENTS.md #7).
        if (!cancelled && mode === 'initial') setStatus('error')
      }
    }

    // Pociąg, który dojechał do ostatniego przystanku (albo ma całą trasę
    // odwołaną), już się nie zmieni — nie ma czego dociągać.
    function journeyOver(): boolean {
      const stops = dataRef.current?.stops
      if (stops === undefined || stops.length === 0) return false
      return stops[stops.length - 1].isConfirmed || stops.every((stop) => stop.isCancelled)
    }

    function backgroundRefresh(): void {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (journeyOver()) return
      void load('background')
    }

    void load('initial')

    document.addEventListener('visibilitychange', backgroundRefresh)
    window.addEventListener('focus', backgroundRefresh)
    const timer = window.setInterval(backgroundRefresh, BACKGROUND_REFRESH_MS)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', backgroundRefresh)
      window.removeEventListener('focus', backgroundRefresh)
      window.clearInterval(timer)
    }
  }, [scheduleId, orderId, operatingDate])

  // Własny zegar wyłącznie na potrzeby „za ile" w nagłówku. `/api/train` to
  // jednorazowy fetch po kliknięciu (AGENTS.md #3), więc bez tego odliczanie
  // zamarzłoby na moment wczytania strony i po godzinie kłamałoby o godzinę.
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
  const stops = data?.stops ?? []
  const nowDate = new Date(now)
  // Pociąg bez ŻADNEJ realizacji, który wg rozkładu właśnie jedzie: pokazujemy
  // szacowaną pozycję i status „w trasie" z jawnym zastrzeżeniem (patrz
  // `isScheduleProjection`, plan „trains-schedule-position"). Decyzja żyje
  // w czystej funkcji obok `resolveCurrentStopIndex`, nie w tym komponencie.
  const scheduleMode = isScheduleProjection(stops, data?.trainStatus ?? null, nowDate)
  const currentStopIndex = scheduleMode ? resolveScheduledStopIndex(stops, nowDate) : resolveCurrentStopIndex(stops)
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

  const categoryLabel = data?.category ?? null
  const trainNumber =
    categoryLabel !== null && data?.nationalNumber
      ? `${categoryLabel} ${data.nationalNumber}`
      : (data?.nationalNumber ?? data?.routeName ?? trainLabel)
  // Nazwa własna pociągu tylko wtedy, gdy nie jest już całym tytułem —
  // „WARTA" pod nagłówkiem „WARTA" to nie informacja, to powtórzenie.
  const routeNameSuffix = data?.routeName !== null && data?.routeName !== undefined && data.routeName !== trainNumber ? data.routeName : null

  const arrivalTime = formatTime(summary.destination?.displayAt ?? null)
  const countdown = formatCountdown(summary.destination?.displayAt ?? null, now)
  const travelTime = formatDuration(summary.plannedDurationMinutes)

  return (
    <div className="flex flex-col gap-6">
      {status === 'loading' && (
        <div className="glass rounded-2xl p-6">
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">{trainLabel}</h1>
          <p className="mt-1 text-sm text-text-muted">Wczytywanie trasy…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="glass rounded-2xl p-6">
          <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
            Nie udało się pobrać szczegółów połączenia.
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Ten widok pobiera dane przy każdym otwarciu i nie ma zapisanej wcześniejszej wersji do pokazania. Spróbuj
            odświeżyć stronę.
          </p>
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
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          {/* Nagłówek + przebieg trasy w jednej kolumnie (`col-start-1`), prawy pasek
              w drugiej i przez oba wiersze — dzięki temu widżety zaczynają się od
              samej góry, a karta nagłówka ma szerokość listy przystanków. */}
          {/* ── Nagłówek ─────────────────────────────────────────────── */}
          <header className="glass @container rounded-2xl p-5 sm:p-6 lg:col-start-1 lg:row-start-1">
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
                  <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                    {trainNumber}
                  </h1>
                  {data.carrierCode !== null && <CarrierLogo carrierCode={data.carrierCode} size={18} />}
                  <span className="text-sm text-text-secondary">{data.carrierName ?? data.carrierCode ?? ''}</span>
                  {routeNameSuffix !== null && <span className="text-sm font-medium text-text-muted">· {routeNameSuffix}</span>}
                </div>
                {summary.origin !== null && summary.destination !== null && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold text-foreground sm:text-xl">
                    <span>{summary.origin.stationName}</span>
                    <span aria-hidden="true" className="text-text-muted">
                      →
                    </span>
                    <span>{summary.destination.stationName}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-5">
                {/* Badge całej podróży: `notStarted` -> „jeszcze nie wyjechał"
                    (kierunek domyślny). Dla nagłówka to informacja („pociąg
                    jeszcze nie ruszył"), a nie truizm „nie przyjechał"; ten
                    drugi ma sens tylko na ostatnim przystanku steppera niżej. */}
                <DelayBadge
                  status={overallStatus}
                  delayMinutes={summary.arrivalDelayMinutes}
                  estimatedDelayMinutes={summary.estimatedArrivalDelayMinutes}
                />
                {arrivalTime !== null && (
                  <div className="text-right">
                    <div className="text-[11px] tracking-[0.08em] text-text-muted uppercase">Przyjazd do celu</div>
                    <div className="font-heading text-3xl font-bold text-foreground tabular-nums">{arrivalTime}</div>
                    {countdown !== null && <div className="text-sm text-text-secondary">{countdown}</div>}
                  </div>
                )}
              </div>
            </div>

            <div
              className="mt-5 grid gap-4 border-t pt-4 text-sm @md:grid-cols-2 @xl:grid-cols-4"
              style={{ borderColor: 'var(--surface-border)' }}
            >
              <MetaItem
                icon={<CalendarIcon size={16} />}
                label="Data"
                value={formatOperatingDate(data.operatingDate) ?? data.operatingDate}
              />
              <MetaItem
                icon={<ClockIcon size={16} />}
                label="Odjazd"
                value={formatTime(summary.origin?.displayAt ?? null) ?? '—'}
                hint={summary.origin?.stationName ?? null}
              />
              <MetaItem
                icon={<ClockIcon size={16} />}
                label="Przyjazd (plan)"
                value={formatTime(summary.destination?.plannedAt ?? null) ?? '—'}
                hint={summary.destination?.stationName ?? null}
              />
              <MetaItem
                icon={<RouteIcon size={16} />}
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
            <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
              {/* Tryb rozkładowy: PKP nie potwierdza nic na tej trasie, a wg
                  rozkładu pociąg jedzie. Pozycja i „w trasie" niżej są wtedy
                  projekcją z rozkładu — trzeba to powiedzieć wprost. */}
              {scheduleMode && (
                <div className="glass flex items-start gap-3 rounded-2xl p-4">
                  <span className="mt-0.5 shrink-0 text-text-muted">
                    <InfoIcon size={17} />
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
                {/* Pionowy stepper: kolumna znacznika ma `flex-direction: column`, więc
                    każdy wiersz sam rysuje swój odcinek „szyny" do następnego przystanku
                    (kropka = status TEGO przystanku, odcinek pod nią = status NASTĘPNEGO —
                    to on informuje, jak wygląda dalsza podróż tym odcinkiem trasy). */}
                {/* `@container`, nie breakpoint okna: szerokość tego wiersza zależy od
                    paska bocznego i prawej kolumny, nie od szerokości ekranu. Przy oknie
                    1024 px lewa kolumna ma ~350 px, a przy 768 px — ~440 px, więc `lg:`
                    włączałby gęsty układ dokładnie tam, gdzie jest CIAŚNIEJ. Zmierzone:
                    przy 768 px nazwy stacji wychodziły poza wiersz. */}
                <ol className="@container mt-4" aria-label="Przebieg trasy">
                  {data.stops.map((stop, index) => {
                    // Oparte na fakcie przyjazdu/odjazdu (planowym LUB faktycznym), nie
                    // tylko planowym — pociąg bez dopasowanej trasy (patrz trainDetail.ts)
                    // ma plannedArrival/plannedDeparture zawsze null, ale wciąż zna
                    // faktyczne czasy i nie może przez to zniknąć z widoku.
                    const hasDeparture = stop.plannedDeparture !== null || stop.actualDeparture !== null
                    // `actualArrival`/`actualDeparture` bez `isConfirmed` nie dowodzi
                    // realizacji (patrz AGENTS.md/realization.ts) — ta sama zasada
                    // dotyczy wyboru CZASU DO WYŚWIETLENIA, nie tylko liczenia statusu.
                    // Niepotwierdzony przystanek pokazuje więc zawsze plan, nigdy
                    // surowe `actual` (które PKP bywa, że ustawia na wartość przesuniętą
                    // o całą dobę dla przystanków daleko w przyszłości).
                    const confirmedArrival = stop.isConfirmed && stop.actualArrival !== null ? stop.actualArrival : null
                    const confirmedDeparture = stop.isConfirmed && stop.actualDeparture !== null ? stop.actualDeparture : null
                    // Wiersz pokazuje jedną godzinę planową i pod nią jedną rzeczywistą:
                    // odjazdową, bo to ona mówi, kiedy podróż stąd rusza dalej. Na
                    // stacji końcowej odjazdu nie ma, więc zostaje przyjazd.
                    // `?? null` przy `predicted*` — odpowiedź API zawsze niesie te pola,
                    // ale ręczne literały w starszych testach mogą ich nie mieć wcale
                    // (brakujący klucz to `undefined`, nie `null`).
                    const plannedTime = formatTime(hasDeparture ? stop.plannedDeparture : stop.plannedArrival)
                    const realized = hasDeparture
                      ? (confirmedDeparture ?? stop.predictedDeparture ?? null)
                      : (confirmedArrival ?? stop.predictedArrival ?? null)
                    const realizedTime = formatTime(realized)
                    const isPrediction =
                      realized !== null && (hasDeparture ? confirmedDeparture === null : confirmedArrival === null)
                    const isFirst = index === 0
                    const isLast = index === data.stops.length - 1
                    const isCurrent = index === currentStopIndex
                    const thisStatus = stopStatuses[index]
                    const nextStatus = stopStatuses[index + 1]
                    // `?? null`/`?? []` — odpowiedź API zawsze niesie te pola, ale
                    // ręczne literały w starszych testach mogą ich nie mieć wcale,
                    // a `undefined !== null` przepuściłoby pustą plakietkę.
                    const messages = stop.disruptionMessages ?? []
                    const stopTypeName = stop.stopTypeName ?? null
                    const stopMinutes = stop.stopMinutes ?? null
                    const showStopMinutes = stopMinutes !== null && stopMinutes >= NOTABLE_STOP_MINUTES
                    const hasBadges = isCurrent || showStopMinutes || stopTypeName !== null || messages.length > 0

                    // Klucz z indeksem, nie sam `stationId`: pociąg z zawrotką mija tę
                    // samą stację dwa razy (np. PODLASIAK: Szczecin Dąbie) — bez indeksu
                    // React myli oba wiersze przy odświeżaniu danych w tle.
                    return (
                      <li key={`${stop.stationId}-${index}`} className="flex gap-3.5">
                        <div className="flex flex-col items-center pt-2.5">
                          {/* Halo z makiety na przystanku, na którym pociąg właśnie stoi —
                              jedyne miejsce w widoku odpowiadające „tu jesteśmy teraz",
                              więc jedyne, które je dostaje (jeden akcent, nie rozsypane efekty). */}
                          <span
                            className={`h-3 w-3 shrink-0 rounded-full ${isCurrent && !scheduleMode ? 'breathe' : ''}`}
                            style={{
                              backgroundColor: STOP_COLOR[thisStatus],
                              boxShadow: isCurrent
                                ? '0 0 0 4px color-mix(in srgb, var(--status-enRoute-bg) 25%, transparent)'
                                : undefined,
                            }}
                            aria-hidden="true"
                          />
                          {!isLast && (
                            <span
                              className="mt-1.5 w-0.5 flex-1"
                              style={{ backgroundColor: STOP_COLOR[nextStatus] }}
                              aria-hidden="true"
                            />
                          )}
                        </div>

                        <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                          <div
                            className={`rounded-xl border px-2.5 py-1.5 ${isCurrent ? '' : 'border-transparent'}`}
                            style={
                              isCurrent
                                ? {
                                    borderColor: 'color-mix(in srgb, var(--status-enRoute-bg) 55%, transparent)',
                                    // 10% przyciemniało wiersz na tyle, że tekst statusu spadał
                                    // do 3,99:1 (zmierzone). 6% zostawia widoczne podświetlenie
                                    // i nie zjada kontrastu — ciężar niesie ramka.
                                    backgroundColor: 'color-mix(in srgb, var(--status-enRoute-bg) 6%, transparent)',
                                  }
                                : undefined
                            }
                          >
                            <div className="grid grid-cols-[3.6rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 @lg:grid-cols-[3.6rem_minmax(0,1fr)_5rem_7rem]">
                              <div className="tabular-nums">
                                <div className="font-semibold text-foreground">{plannedTime ?? '—'}</div>
                                {realizedTime !== null && realizedTime !== plannedTime && (
                                  <div
                                    className={`text-xs font-medium ${isPrediction ? 'italic' : ''}`}
                                    style={{ color: STATUS_TEXT[thisStatus] }}
                                    title={isPrediction ? PREDICTED_TIME_TOOLTIP : undefined}
                                  >
                                    {realizedTime}
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0">
                                <span className={`${isFirst || isLast ? 'font-semibold' : 'font-medium'} break-words text-foreground`}>
                                  {stop.stationName}
                                </span>
                                {(isFirst || isLast) && (
                                  <span className="ml-2 text-[10px] tracking-[0.1em] text-text-muted uppercase">
                                    {isFirst ? 'odjazd' : 'przyjazd'}
                                  </span>
                                )}
                              </div>

                              {/* Peron i tor są dwiema niezależnymi wartościami
                                  (jedna bywa znana bez drugiej), więc każda ma
                                  własną etykietę zamiast sklejenia „4/2".
                                  Nic nie pokazujemy, gdy nie znamy żadnej. */}
                              <div className="text-sm text-text-secondary tabular-nums">
                                {formatPlatformTrack(stop.platform, stop.track)}
                              </div>

                              <div className="@lg:text-right">
                                <DelayBadge
                                  status={thisStatus}
                                  delayMinutes={stopDelayMinutes(stop)}
                                  // Ostatni przystanek to tylko przyjazd -> „jeszcze nie przyjechał";
                                  // wszystkie wcześniejsze wiersz opisuje odjazdowo.
                                  direction={isLast ? 'arrival' : 'departure'}
                                  estimatedDelayMinutes={stop.estimatedDelayMinutes}
                                  variant="text"
                                />
                              </div>
                            </div>

                            {hasBadges && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {isCurrent && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                                    style={{
                                      backgroundColor: 'var(--status-enRoute-bg)',
                                      color: 'var(--status-enRoute-fg)',
                                    }}
                                  >
                                    <TrainIcon size={12} />
                                    {scheduleMode ? 'Pociąg jest tutaj — wg rozkładu' : 'Pociąg jest tutaj'}
                                  </span>
                                )}
                                {showStopMinutes && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-text-secondary"
                                    style={{ borderColor: 'var(--surface-border)' }}
                                  >
                                    <PauseIcon size={11} />
                                    Postój {stopMinutes} min
                                  </span>
                                )}
                                {stopTypeName !== null && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                    <InfoIcon size={11} />
                                    {stopTypeName}
                                  </span>
                                )}
                                {messages.length > 0 && (
                                  <details className="w-full">
                                    <summary className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                      <AlertCircleIcon size={11} />
                                      Utrudnienie
                                    </summary>
                                    <p className="mt-1.5 text-xs text-text-secondary">{messages.join(' ')}</p>
                                  </details>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>

              {/* Baner utrudnień: „brak wyników" i „nie udało się sprawdzić" to dwa
                  różne komunikaty (AGENTS.md #7) — ten mówi wyłącznie to pierwsze.
                  Awaria pobrania ma własny komunikat wyżej. */}
              {routeDisruptions.length === 0 ? (
                <div className="glass flex items-start gap-3 rounded-2xl p-4">
                  <span className="mt-0.5 shrink-0 text-text-muted">
                    <InfoIcon size={17} />
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
                  <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400">
                    <AlertCircleIcon size={17} />
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
            <aside className="flex flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-6 lg:max-h-[calc(100dvh_-_3rem)] lg:overflow-y-auto">
              <section className="glass rounded-2xl p-5">
                <SectionHeading>Informacje o połączeniu</SectionHeading>
                <dl className="mt-2 divide-y" style={{ borderColor: 'var(--surface-border)' }}>
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

              <section className="glass rounded-2xl p-5">
                <SectionHeading>Udostępnij połączenie</SectionHeading>
                <p className="mt-2 text-sm text-text-secondary">
                  Wyślij szczegóły tego połączenia innym lub skopiuj link do niego.
                </p>
                <button
                  type="button"
                  onClick={() => void share()}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold text-foreground transition hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ borderColor: 'var(--surface-border)' }}
                >
                  {copied ? <LinkIcon size={15} /> : <ShareIcon size={15} />}
                  {copied ? 'Skopiowano link' : 'Kopiuj link'}
                </button>
              </section>
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}
