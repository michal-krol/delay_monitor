'use client'

import { useState } from 'react'
import { useCities } from '@/hooks/useCities'
import { useDropdown } from '@/hooks/useDropdown'
import { SM_UP, useMediaQuery } from '@/hooks/useMediaQuery'
import { useStationWeather, type UseStationWeatherResult } from '@/hooks/useStationWeather'
import { describeWeatherCode } from '@/lib/weather/format'
import { CloudIcon, ICON_SIZE } from './icons'
import { InfoSheet } from './InfoSheet'
import { WEATHER_ICONS, WeatherCard } from './StationAside'

/**
 * Pogoda miasta jako chip (ikona + temperatura) w pasku ekranu miasta; dotknięcie otwiera
 * szczegóły (`WeatherCard`): na telefonie arkusz, od `sm` dymek (`useDropdown`). Zastępuje kartę
 * w prawej kolumnie — pogoda to ciekawostka, nie powód wejścia na ekran.
 *
 * ponytail: pogoda miasta ≈ pogoda jego głównej stacji kolejowej (`/api/weather`
 * jest kluczowane po stacji PKP). Gdyby to było za grube przybliżenie —
 * `/api/weather` po lat/lon przystanku, osobny temat.
 *
 * Bez wartości nie ma temperatury (#7): wczytywanie / błąd / brak lokalizacji pokazują samą
 * ikonę, a stan opisuje nazwa przycisku i treść dymka.
 */
function useCityWeather(city: string): { weather: UseStationWeatherResult; cityName: string } {
  const { state: citiesState, cities } = useCities()
  const entry = cities.find((option) => option.id === city) ?? null

  const stationId = entry?.railStations?.[0]?.id ?? ''
  const fetchedWeather = useStationWeather(stationId)
  // /api/cities zawiodło, albo miasto nie ma (jeszcze) żadnej stacji kolejowej
  // -- w obu przypadkach zamiast wołać `useStationWeather('')` (zostawałoby
  // w `loading` na zawsze, bo hook nie odpytuje przy pustym `stationId`),
  // pokazujemy istniejący stan „brak lokalizacji" karty pogody.
  const noLocation = citiesState === 'failed' || (citiesState === 'ready' && stationId === '')
  return { weather: noLocation ? { status: 'unavailable' } : fetchedWeather, cityName: entry?.name ?? city }
}

const STATE_NAME: Record<Exclude<UseStationWeatherResult['status'], 'ready'>, string> = {
  loading: 'Pogoda: wczytywanie…',
  error: 'Pogoda: nie udało się pobrać',
  unavailable: 'Pogoda: brak danych lokalizacyjnych',
}

export function WeatherChip({ city }: { city: string }) {
  const { weather, cityName } = useCityWeather(city)
  const wide = useMediaQuery(SM_UP, true)
  const { open, toggle, rootRef, buttonRef, panelId } = useDropdown({ focusTriggerOnEscape: true })
  const [sheetOpen, setSheetOpen] = useState(false)

  const ready = weather.status === 'ready' ? weather.weather.current : null
  const condition = ready === null ? null : describeWeatherCode(ready.weatherCode)
  const Icon = condition === null ? CloudIcon : WEATHER_ICONS[condition.icon]
  const label = ready === null || condition === null ? STATE_NAME[weather.status as keyof typeof STATE_NAME] : `Pogoda: ${Math.round(ready.temperatureC)}°C, ${condition.label}`
  const title = `Pogoda dziś — ${cityName}`
  const expanded = wide ? open : sheetOpen

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={wide ? panelId : undefined}
        onClick={() => (wide ? toggle() : setSheetOpen((open) => !open))}
        className={`press touch-44 relative inline-flex h-9 items-center gap-1.5 rounded-full border border-surface-border px-3 text-sm font-medium transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-white/10 ${ready === null ? 'text-text-muted' : 'text-foreground'}`}
      >
        <Icon size={ICON_SIZE.button} />
        {ready !== null && <span className="tabular-nums">{Math.round(ready.temperatureC)}°</span>}
      </button>
      {wide && open && (
        <section id={panelId} aria-label={title} className="glass-chrome-strong enter-pop absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-surface-border p-4 shadow-xl">
          <h3 className="font-heading mb-3 text-sm font-bold tracking-tight text-foreground">{title}</h3>
          <WeatherCard weather={weather} />
        </section>
      )}
      {!wide && sheetOpen && (
        <InfoSheet title={title} closeLabel="Zamknij pogodę" onClose={() => setSheetOpen(false)}>
          <WeatherCard weather={weather} />
        </InfoSheet>
      )}
    </div>
  )
}
