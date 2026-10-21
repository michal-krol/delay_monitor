'use client'

import { useEffect, useRef, useState } from 'react'
import { useCities } from '@/hooks/useCities'
import { useDropdown } from '@/hooks/useDropdown'
import { SM_UP, useMediaQuery } from '@/hooks/useMediaQuery'
import { useStationWeather, type UseStationWeatherResult } from '@/hooks/useStationWeather'
import { describeWeatherCode } from '@/lib/weather/format'
import { CloudIcon, ICON_SIZE } from './icons'
import { InfoSheet } from './InfoSheet'
import { WEATHER_ICONS, WeatherCard } from './StationAside'
import { useHeaderWeather } from './pageHeader'

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

export function CityWeatherChip({ city }: { city: string }) {
  const { weather, cityName } = useCityWeather(city)
  useHeaderWeather(weather, cityName)
  const wide = useMediaQuery(SM_UP, true)
  return <span className="hidden sm:contents">{wide ? <WeatherChip weather={weather} locationName={cityName} /> : null}</span>
}

export function WeatherChip({ weather, locationName }: { weather: UseStationWeatherResult; locationName: string }) {
  const wide = useMediaQuery(SM_UP, true)
  const { open, toggle, rootRef, buttonRef, panelId } = useDropdown({ focusTriggerOnEscape: true })
  const [sheetOpen, setSheetOpen] = useState(false)
  useEffect(() => () => {
    if (!open && !sheetOpen) return
    if (typeof window.matchMedia !== 'function' || window.matchMedia(SM_UP).matches === wide) return
    requestAnimationFrame(() => {
      [...document.querySelectorAll<HTMLButtonElement>('[data-weather-trigger]')].find((element) => element.getClientRects().length > 0)?.focus({ preventScroll: true })
    })
  }, [wide, open, sheetOpen])
  const lastWide = useRef(wide)
  useEffect(() => {
    if (lastWide.current === wide) return
    lastWide.current = wide
    if (!open && !sheetOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the old viewport's weather overlay must not reopen on the next resize
    setSheetOpen(false)
    if (open) toggle()
  }, [wide, open, sheetOpen, toggle])

  const ready = weather.status === 'ready' ? weather.weather.current : null
  const condition = ready === null ? null : describeWeatherCode(ready.weatherCode)
  const Icon = condition === null ? CloudIcon : WEATHER_ICONS[condition.icon]
  const label = ready === null || condition === null ? STATE_NAME[weather.status as keyof typeof STATE_NAME] : `Pogoda: ${Math.round(ready.temperatureC)}°C, ${condition.label}`
  const title = locationName === '' ? 'Pogoda' : `Pogoda dziś — ${locationName}`
  const expanded = wide ? open : sheetOpen

  return (
    <div ref={rootRef} className="relative">
      <button
        data-weather-trigger
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={wide ? panelId : undefined}
        onClick={(event) => {
          // Safari nie fokusuje przycisku po kliknięciu — arkusz pogody oddaje fokus temu, co miało go przy otwarciu.
          event.currentTarget.focus({ preventScroll: true })
          if (wide) toggle()
          else setSheetOpen((open) => !open)
        }}
        className={`press relative inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-surface-border px-2 text-sm font-medium transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-white/10 ${ready === null ? 'text-text-muted' : 'text-foreground'}`}
      >
        <Icon size={ICON_SIZE.button} />
        {ready !== null && <span className="tabular-nums">{Math.round(ready.temperatureC)}°</span>}
      </button>
      {wide && open && (
        <section id={panelId} aria-label={title} className="glass-chrome-strong enter-pop absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-surface-border p-4 shadow-xl">
          <h3 className="font-heading mb-3 text-sm font-bold tracking-tight text-foreground">{title}</h3>
          {locationName === '' ? <p className="text-sm text-text-secondary">Wybierz miasto, stację lub połączenie, aby zobaczyć pogodę.</p> : <WeatherCard weather={weather} />}
        </section>
      )}
      {!wide && sheetOpen && (
        <InfoSheet title={title} closeLabel="Zamknij pogodę" onClose={() => setSheetOpen(false)}>
          {locationName === '' ? <p className="text-sm text-text-secondary">Wybierz miasto, stację lub połączenie, aby zobaczyć pogodę.</p> : <WeatherCard weather={weather} />}
        </InfoSheet>
      )}
    </div>
  )
}
