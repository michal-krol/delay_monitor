'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import type { StationInsights, StationStats } from '@/lib/board/stationStats'
import type { UseStationWeatherResult } from '@/hooks/useStationWeather'
import { MapView } from './MapView'
import {
  AlertCircleIcon,
  ChevronRightIcon,
  CloudIcon,
  DropletIcon,
  FogIcon,
  GaugeIcon,
  RainIcon,
  SnowIcon,
  SunIcon,
  ThunderIcon,
  WindIcon,
  ICON_SIZE,
} from './icons'
import { compassDirection, describeWeatherCode, type WeatherIconKey } from '@/lib/weather/format'
import { pluralPl } from '@/lib/plural'
import { formatClockTime } from '@/lib/format'
import { AsideCard, EmptyHint, HourlyTraffic } from './aside'
import { InfoSection, useInInfoSheet } from './InfoSheet'
import { StationStatsCards } from './StationStatsCards'
import { StatusLegendList } from './BoardTable'

/**
 * Prawa kolumna kontekstowa widoku stacji.
 *
 * Trzy moduły, wszystkie zasilane wyłącznie z tego, co poller już policzył
 * (`snapshot.insights`, `snapshot.disruptionMessages`) — **ani jednego
 * dodatkowego zapytania do PKP**. Makieta ma tu jeszcze wyszukiwarkę połączeń
 * A→B; ta świadomie nie wchodzi, bo byłaby realnym zapytaniem do PKP przy
 * każdym szukaniu, poza cyklem i budżetem pollera (AGENTS.md #3).
 *
 * Kolumna nie dubluje tabeli (makieta §C) — daje kontekst, którego w niej nie
 * ma: dokąd stąd najczęściej się jedzie, co jest zepsute i kiedy jest tłok.
 */

/**
 * `list` — karta w prawej kolumnie (od `xl`), z liczbą połączeń i komunikatami stanów. `chips` — te same
 * kierunki jako filtry nad tablicą poniżej `xl` (ten sam stan w `FullBoard`): przewijane w poziomie
 * zamiast zawijania (pierwszy odjazd ma się zmieścić na ekranie), cele 44 px; bez rzędu, gdy nie ma
 * czego pokazać — stany ładowania/błędu mówi wtedy karta, nie pasek nad tablicą.
 */
export function PopularDestinations({
  insights,
  loading,
  onSelect,
  selected,
  variant = 'list',
}: {
  insights: StationInsights | undefined
  loading: boolean
  onSelect: (name: string | null) => void
  selected: string | null
  variant?: 'list' | 'chips'
}) {
  const destinations = insights?.topDestinations ?? []

  if (variant === 'chips') {
    if (loading || destinations.length === 0) return null
    return (
      <div role="group" aria-label="Najpopularniejsze kierunki" className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 xl:hidden">
        {destinations.map((destination) => {
          const active = selected === destination.name
          return (
            <button
              key={destination.stationId}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(active ? null : destination.name)}
              className="chip-filter press shrink-0"
            >
              {destination.name}
            </button>
          )
        })}
      </div>
    )
  }

  // Trzy różne stany, trzy różne komunikaty (AGENTS.md #7): „jeszcze się
  // ładuje", „nie udało się pobrać" i „pobrano, ale nic tu nie ma".
  if (loading) return <EmptyHint>Wczytywanie rozkładu…</EmptyHint>
  if (insights === undefined || insights.hourlyTraffic === null) {
    return <EmptyHint>Nie udało się pobrać rozkładu, więc nie znamy dzisiejszych kierunków.</EmptyHint>
  }
  if (destinations.length === 0) {
    return <EmptyHint>Z tej stacji nie odjeżdża dziś żaden pociąg dalej w trasę.</EmptyHint>
  }

  return (
    <ul className="flex flex-col gap-1">
      {destinations.map((destination) => {
        const active = selected === destination.name
        return (
          <li key={destination.stationId}>
            <button
              type="button"
              // Klik filtruje tablicę, a nie uruchamia wyszukiwarki -- tej
              // świadomie nie budujemy (patrz nagłówek pliku).
              onClick={() => onSelect(active ? null : destination.name)}
              aria-pressed={active}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/5 ${
                active ? 'bg-black/5 dark:bg-white/10' : ''
              }`}
            >
              {/* Spacja po nazwie jest znakiem treści, nie tylko odstępem:
                  `gap-2` rozsuwa je wizualnie, ale czytnik ekranu przeczytałby
                  „Kraków Główny24 połączenia" jednym ciągiem. */}
              <span className="min-w-0 flex-1 truncate text-foreground">{destination.name} </span>
              <span className="shrink-0 text-xs text-text-muted tabular-nums">
                {destination.count} {pluralPl(destination.count, 'połączenie', 'połączenia', 'połączeń')}
              </span>
              <ChevronRightIcon size={ICON_SIZE.chip} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function StationDisruptions({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return <EmptyHint>Brak zgłoszonych utrudnień dla tej stacji.</EmptyHint>
  }

  return (
    <ul className="flex flex-col gap-2">
      {messages.map((message) => (
        <li key={message} className="flex gap-2 text-xs text-text-secondary">
          <span className="mt-0.5 shrink-0 text-warning-text" aria-hidden="true">
            <AlertCircleIcon size={ICON_SIZE.inline} />
          </span>
          <span>{message}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Natężenie ruchu w dobie — 24 słupki, jeden na godzinę.
 *
 * Inline SVG, wzorem `DelayForecast.tsx`: zależności projektu to dziś
 * dokładnie `next`, `react`, `react-dom` i `zod`, i tak ma zostać. Biblioteka
 * wykresów dla dwudziestu czterech prostokątów byłaby absurdem.
 */
export const WEATHER_ICONS: Record<WeatherIconKey, (props: { size?: number; className?: string }) => React.ReactNode> = {
  sun: SunIcon,
  cloud: CloudIcon,
  fog: FogIcon,
  rain: RainIcon,
  snow: SnowIcon,
  thunder: ThunderIcon,
}

function WeatherStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 text-text-muted" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-text-muted">{label}</span>
        <span className="block truncate text-foreground tabular-nums">{value}</span>
      </span>
    </div>
  )
}

/**
 * Pogoda dziś dla stacji -- jedyny moduł tej kolumny, który jest naprawdę
 * nowym zapytaniem sieciowym (Open-Meteo), nie czymś policzonym z tego, co
 * poller już ma. Stąd osobny stan (`useStationWeather`, przekazywany z
 * zewnątrz -- ten komponent zostaje czysto prezentacyjny) i osobna, czwarta
 * wartość stanu: „brak danych lokalizacyjnych" to coś innego niż „nie udało
 * się pobrać" (AGENTS.md #7 -- różne komunikaty dla różnych przyczyn).
 */
export function WeatherCard({ weather }: { weather: UseStationWeatherResult }) {
  if (weather.status === 'loading') return <EmptyHint>Wczytywanie pogody…</EmptyHint>
  if (weather.status === 'error') return <EmptyHint>Nie udało się pobrać pogody.</EmptyHint>
  if (weather.status === 'unavailable') return <EmptyHint>Brak danych lokalizacyjnych dla tej stacji.</EmptyHint>

  const { current, today, fetchedAt } = weather.weather
  const condition = describeWeatherCode(current.weatherCode)
  const Icon = WEATHER_ICONS[condition.icon]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-foreground" aria-hidden="true">
          <Icon size={32} />
        </span>
        <div className="min-w-0">
          <span className="font-heading text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
            {Math.round(current.temperatureC)}°C
          </span>
          <p className="text-xs text-text-muted">
            Odczuwalna {Math.round(current.apparentTemperatureC)}° · {condition.label}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <WeatherStat
          icon={<WindIcon size={ICON_SIZE.inline} />}
          label="Wiatr"
          value={`${Math.round(current.windSpeedKmh)} km/h ${compassDirection(current.windDirectionDeg)}`}
        />
        <WeatherStat icon={<DropletIcon size={ICON_SIZE.inline} />} label="Wilgotność" value={`${Math.round(current.humidityPercent)}%`} />
        <WeatherStat icon={<GaugeIcon size={ICON_SIZE.inline} />} label="Ciśnienie" value={`${Math.round(current.pressureHpa)} hPa`} />
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-surface-border pt-3 text-xs">
        <div>
          <span className="block text-text-muted">Min / max dziś</span>
          <span className="tabular-nums text-foreground">
            {Math.round(today.minTemperatureC)}° / {Math.round(today.maxTemperatureC)}°
          </span>
        </div>
        <div>
          <span className="block text-text-muted">Opady dziś</span>
          <span className="tabular-nums text-foreground">
            {today.precipitationMm.toFixed(1)} mm · {Math.round(today.precipitationProbabilityPercent)}%
          </span>
        </div>
        <div>
          <span className="block text-text-muted">Wschód / zachód</span>
          <span className="tabular-nums text-foreground">
            {formatClockTime(today.sunrise)} / {formatClockTime(today.sunset)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--status-onTime-bg)' }} aria-hidden="true" />
          Open-Meteo
        </span>
        <span>Aktualizacja: {formatClockTime(fetchedAt)}</span>
      </div>
    </div>
  )
}

type Props = {
  insights: StationInsights | undefined
  disruptionMessages: string[]
  /** Aktualnie wybrany kierunek filtrowania tablicy, `null` = bez filtra. */
  destinationFilter: string | null
  onDestinationFilter: (name: string | null) => void
  /** Snapshotu jeszcze nie ma — „ładuje się" to nie to samo co „nie udało się pobrać". */
  loading: boolean
  /** Godzina warszawska „teraz" — wyróżniony słupek. Podawana z zewnątrz, żeby komponent pozostał czysty. */
  currentHour: number
  weather: UseStationWeatherResult
  /**
   * Nazwa stacji, do podpisu w nagłówku karty pogody -- bez tego widżet
   * wygląda jak pogoda „u mnie" (bieżąca lokalizacja użytkownika), nie
   * pogoda przy tej konkretnej stacji. Ta sama nazwa co w nagłówku strony
   * (`FullBoard`), więc bez osobnego zapytania -- podana z zewnątrz.
   */
  stationName: string
  stationId: string
  /** Pozycja stacji z listy stacji kolei (`useRailStations`, statyczna, 0 PKP) -- nie z pogody; `null` = brak, wtedy bez karty mapy. */
  location: { lat: number; lon: number } | null
  /** 2 najbliższe odjazdy, gotowe linijki („18:12 → Kutno") — do popupu powiększonej mapy (`MapView.tsx`). Puste = brak podglądu, nie błąd. */
  mapPreview: string[]
  /** Kafelki KPI — tylko w arkuszu „Info” (od `sm` stoją nad tablicą w `FullBoard`). */
  stats?: StationStats
}

export function StationAside({
  insights,
  disruptionMessages,
  destinationFilter,
  onDestinationFilter,
  loading,
  currentHour,
  weather,
  stationName,
  stationId,
  location,
  mapPreview,
  stats,
}: Props) {
  const { resolvedTheme } = useTheme()
  const inSheet = useInInfoSheet()
  const mapPins = useMemo(
    () => (location === null ? [] : [{ id: stationId, lat: location.lat, lon: location.lon, label: stationName, mode: 'rail' as const, preview: mapPreview }]),
    [location, stationId, stationName, mapPreview]
  )

  const disruptions = (
    <InfoSection title="Utrudnienia na tej stacji">
      <StationDisruptions messages={disruptionMessages} />
    </InfoSection>
  )
  const traffic = (
    <HourlyTraffic
      hourly={insights?.hourlyTraffic ?? null}
      loading={loading}
      currentHour={currentHour}
      emptyLabel="Rozkład na dziś nie zawiera odjazdów z tej stacji."
    />
  )
  const weatherCard = (
    <InfoSection title={`Pogoda dziś — ${stationName}`}>
      <WeatherCard weather={weather} />
    </InfoSection>
  )
  const map = mapPins.length > 0 && (
    <InfoSection title="Mapa" collapsible>
      <MapView pins={mapPins} ariaLabel={`Mapa stacji ${stationName}`} dark={resolvedTheme === 'dark'} />
    </InfoSection>
  )

  // Telefon, arkusz „Info” (brief §8): utrudnienia → statystyki (zwinięte) → pogoda → mapa (leniwa) → legenda.
  // Bez listy kierunków — ten sam filtr to `DirectionSelect` nad tablicą (decyzja 2026-10-09).
  if (inSheet) {
    return (
      <>
        {disruptions}
        <InfoSection title="Statystyki stacji dzisiaj" collapsible>
          <div className="flex flex-col gap-4">
            <StationStatsCards stats={stats} loading={loading} />
            <div>
              <h4 className="mb-2 text-xs font-medium text-text-muted">Natężenie ruchu</h4>
              {traffic}
            </div>
          </div>
        </InfoSection>
        {weatherCard}
        {map}
        <InfoSection title="Legenda statusów" collapsible>
          <StatusLegendList />
        </InfoSection>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Od `sm` do `xl` te kierunki są filtrami nad tablicą (`FullBoard`) — tu tylko w prawej kolumnie od `xl`. */}
      <AsideCard title="Najpopularniejsze kierunki" className="hidden xl:block">
        <PopularDestinations insights={insights} loading={loading} onSelect={onDestinationFilter} selected={destinationFilter} />
      </AsideCard>
      {disruptions}
      <AsideCard title="Natężenie ruchu dzisiaj">{traffic}</AsideCard>
      {weatherCard}
      {map}
    </div>
  )
}
