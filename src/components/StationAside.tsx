'use client'

import type { StationInsights } from '@/lib/board/stationStats'
import type { UseStationWeatherResult } from '@/hooks/useStationWeather'
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
} from './icons'
import { compassDirection, describeWeatherCode, type WeatherIconKey } from '@/lib/weather/format'
import { pluralPl } from '@/lib/plural'
import { formatClockTime } from '@/lib/format'
import { AsideCard, EmptyHint, HourlyTraffic } from './aside'

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

function PopularDestinations({
  insights,
  loading,
  onSelect,
  selected,
}: {
  insights: StationInsights | undefined
  loading: boolean
  onSelect: (name: string | null) => void
  selected: string | null
}) {
  const destinations = insights?.topDestinations ?? []

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
              <ChevronRightIcon size={13} />
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
          <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true">
            <AlertCircleIcon size={14} />
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
const WEATHER_ICONS: Record<WeatherIconKey, (props: { size?: number; className?: string }) => React.ReactNode> = {
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
          icon={<WindIcon size={14} />}
          label="Wiatr"
          value={`${Math.round(current.windSpeedKmh)} km/h ${compassDirection(current.windDirectionDeg)}`}
        />
        <WeatherStat icon={<DropletIcon size={14} />} label="Wilgotność" value={`${Math.round(current.humidityPercent)}%`} />
        <WeatherStat icon={<GaugeIcon size={14} />} label="Ciśnienie" value={`${Math.round(current.pressureHpa)} hPa`} />
      </div>

      <div className="grid grid-cols-3 gap-2 border-t pt-3 text-xs" style={{ borderColor: 'var(--surface-border)' }}>
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

      <div className="flex items-center justify-between text-[10px] text-text-muted">
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
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      <AsideCard title="Najpopularniejsze kierunki">
        <PopularDestinations insights={insights} loading={loading} onSelect={onDestinationFilter} selected={destinationFilter} />
      </AsideCard>
      <AsideCard title="Utrudnienia na tej stacji">
        <StationDisruptions messages={disruptionMessages} />
      </AsideCard>
      <AsideCard title="Natężenie ruchu dzisiaj">
        <HourlyTraffic
          hourly={insights?.hourlyTraffic ?? null}
          loading={loading}
          currentHour={currentHour}
          emptyLabel="Rozkład na dziś nie zawiera odjazdów z tej stacji."
        />
      </AsideCard>
      <AsideCard title={`Pogoda dziś — ${stationName}`}>
        <WeatherCard weather={weather} />
      </AsideCard>
    </div>
  )
}
