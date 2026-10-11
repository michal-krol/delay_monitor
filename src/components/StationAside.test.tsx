// @vitest-environment jsdom
import { createElement } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PopularDestinations, StationAside } from './StationAside'
import { InfoSheet } from './InfoSheet'
import { stubDialogMethods } from '@/test-utils/dialog'
import type { StationInsights } from '@/lib/board/stationStats'
import type { UseStationWeatherResult } from '@/hooks/useStationWeather'

// Podgląd pinów przekazanych do mapy; sama mapa renderuje się naprawdę (jsdom nie ładuje MapLibre).
const mapSpy = vi.hoisted(() => ({ pins: [] as { id: string; lat: number; lon: number }[] }))
vi.mock('./MapView', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./MapView')>()
  return {
    ...actual,
    MapView: (props: React.ComponentProps<typeof actual.MapView>) => {
      mapSpy.pins = props.pins
      return createElement(actual.MapView, props)
    },
  }
})

/** Lokalizacja stacji z listy stacji kolei (`useRailStations`), nie z pogody. */
const LOCATION = { lat: 52.22977, lon: 21.01178 }

const READY_WEATHER: UseStationWeatherResult = {
  status: 'ready',
  weather: {
    current: {
      temperatureC: 21.7,
      apparentTemperatureC: 21.0,
      weatherCode: 2,
      windSpeedKmh: 10.4,
      windDirectionDeg: 225,
      humidityPercent: 56,
      pressureHpa: 1013.2,
    },
    today: {
      minTemperatureC: 12.9,
      maxTemperatureC: 25.6,
      precipitationMm: 2.3,
      precipitationProbabilityPercent: 2,
      sunrise: '2026-08-30T05:44',
      sunset: '2026-08-30T19:28',
    },
    fetchedAt: '2026-08-30T18:50:00+02:00',
  },
  location: { lat: 52.2297, lon: 21.0122 },
}

const INSIGHTS: StationInsights = {
  topDestinations: [
    { stationId: '80416', name: 'Kraków Główny', count: 24 },
    { stationId: '7500', name: 'Gdańsk Główny', count: 1 },
    { stationId: '60103', name: 'Wrocław Główny', count: 2 },
  ],
  hourlyTraffic: Array.from({ length: 24 }, (_, hour) => (hour === 8 ? 12 : 0)),
}

function renderAside(overrides: Partial<React.ComponentProps<typeof StationAside>> = {}) {
  const props = {
    insights: INSIGHTS,
    disruptionMessages: [],
    destinationFilter: null,
    onDestinationFilter: vi.fn(),
    loading: false,
    currentHour: 8,
    weather: READY_WEATHER,
    location: LOCATION,
    stationName: 'Warszawa Centralna',
    stationId: '33605',
    mapPreview: [],
    stats: undefined,
    ...overrides,
  }
  render(<StationAside {...props} />)
  return props
}

describe('StationAside', () => {
  it('lists the top destinations with a correctly inflected connection count', () => {
    renderAside()

    // Sprawdzamy tekst renderowany (`textContent` przycisku), nie nazwę
    // dostępną: nazwa dostępna przycina wkład każdego elementu z osobna, więc
    // spacja rozdzielająca nazwę stacji od liczby w niej nie przetrwa. To, co
    // widzi i czyta użytkownik, jest tu właściwym przedmiotem asercji.
    // Pomijamy przycisk „Powiększ mapę" (karta Mapa) -- ta sama kolumna, inny temat.
    const labels = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-label') !== 'Powiększ mapę')
      .map((button) => button.textContent)

    // 24 -> „połączenia" (końcówka 4 poza nastkami), 1 -> „połączenie",
    // 2 -> „połączenia" -- polska odmiana przez `pluralPl`, nie sztywne „połączeń".
    // Kolejność jest ta, którą podał wywołujący -- sortowanie należy do
    // warstwy danych (`computeStationSchedule`), nie do komponentu.
    expect(labels).toEqual([
      'Kraków Główny 24 połączenia',
      'Gdańsk Główny 1 połączenie',
      'Wrocław Główny 2 połączenia',
    ])
  })

  it('reports the picked destination to the caller and toggles it off on a second click', async () => {
    const user = userEvent.setup()
    const { onDestinationFilter } = renderAside({ destinationFilter: 'Kraków Główny' })

    const button = screen.getByRole('button', { name: /Kraków Główny/ })
    expect(button).toHaveAttribute('aria-pressed', 'true')

    await user.click(button)
    // Kliknięcie już wybranego kierunku zdejmuje filtr, zamiast ustawiać go ponownie.
    expect(onDestinationFilter).toHaveBeenCalledWith(null)
  })

  it('distinguishes loading from a failed schedule fetch', () => {
    const { unmount } = render(
      <StationAside
        insights={undefined}
        disruptionMessages={[]}
        destinationFilter={null}
        onDestinationFilter={vi.fn()}
        loading
        currentHour={8}
        stationName="Warszawa Centralna"
        stationId="33605"
        mapPreview={[]}
        weather={READY_WEATHER}
        location={LOCATION}
      />
    )
    expect(screen.getAllByText('Wczytywanie rozkładu…')).toHaveLength(2)
    expect(screen.queryByText(/Nie udało się pobrać rozkładu/)).not.toBeInTheDocument()
    unmount()

    render(
      <StationAside
        insights={undefined}
        disruptionMessages={[]}
        destinationFilter={null}
        onDestinationFilter={vi.fn()}
        loading={false}
        currentHour={8}
        stationName="Warszawa Centralna"
        stationId="33605"
        mapPreview={[]}
        weather={READY_WEATHER}
        location={LOCATION}
      />
    )
    expect(screen.getAllByText(/Nie udało się pobrać rozkładu/)).toHaveLength(2)
  })

  it('separates "no disruptions reported" from the disruption list', () => {
    const { unmount } = render(
      <StationAside
        insights={INSIGHTS}
        disruptionMessages={[]}
        destinationFilter={null}
        onDestinationFilter={vi.fn()}
        loading={false}
        currentHour={8}
        stationName="Warszawa Centralna"
        stationId="33605"
        mapPreview={[]}
        weather={READY_WEATHER}
        location={LOCATION}
      />
    )
    expect(screen.getByText('Brak zgłoszonych utrudnień dla tej stacji.')).toBeInTheDocument()
    unmount()

    render(
      <StationAside
        insights={INSIGHTS}
        disruptionMessages={['Awaria sieci trakcyjnej']}
        destinationFilter={null}
        onDestinationFilter={vi.fn()}
        loading={false}
        currentHour={8}
        stationName="Warszawa Centralna"
        stationId="33605"
        mapPreview={[]}
        weather={READY_WEATHER}
        location={LOCATION}
      />
    )
    expect(screen.getByText('Awaria sieci trakcyjnej')).toBeInTheDocument()
  })

  it('says the schedule is empty rather than pretending the traffic chart failed', () => {
    // Rozkład pobrany, ale bez odjazdów -- to inna rzecz niż brak rozkładu.
    renderAside({ insights: { topDestinations: [], hourlyTraffic: new Array(24).fill(0) } })

    expect(screen.getByText('Rozkład na dziś nie zawiera odjazdów z tej stacji.')).toBeInTheDocument()
    expect(screen.getByText('Z tej stacji nie odjeżdża dziś żaden pociąg dalej w trasę.')).toBeInTheDocument()
  })

  it('describes the traffic chart for screen readers instead of leaving bare bars', () => {
    renderAside()

    expect(screen.getByRole('img', { name: /szczyt 12 o godzinie 8/ })).toBeInTheDocument()
  })

  describe('weather card', () => {
    it('names the station in the card header, so it does not read as "weather at my location"', () => {
      renderAside({ stationName: 'Kraków Główny' })
      expect(screen.getByRole('heading', { name: 'Pogoda dziś — Kraków Główny' })).toBeInTheDocument()
    })

    it('shows a loading hint while the fetch is in flight', () => {
      renderAside({ weather: { status: 'loading' } })
      expect(screen.getByText('Wczytywanie pogody…')).toBeInTheDocument()
    })

    it('distinguishes a failed fetch from a station with no location data', () => {
      const { unmount } = render(
        <StationAside
          insights={INSIGHTS}
          disruptionMessages={[]}
          destinationFilter={null}
          onDestinationFilter={vi.fn()}
          loading={false}
          currentHour={8}
        stationName="Warszawa Centralna"
        stationId="33605"
        mapPreview={[]}
          weather={{ status: 'error' }}
          location={LOCATION}
        />
      )
      expect(screen.getByText('Nie udało się pobrać pogody.')).toBeInTheDocument()
      unmount()

      renderAside({ weather: { status: 'unavailable' } })
      expect(screen.getByText('Brak danych lokalizacyjnych dla tej stacji.')).toBeInTheDocument()
    })

    it('renders the current conditions, wind/humidity/pressure and today’s min/max/precipitation/sunrise-sunset', () => {
      renderAside({ weather: READY_WEATHER })

      expect(screen.getByText('22°C')).toBeInTheDocument()
      expect(screen.getByText('Odczuwalna 21° · Częściowe zachmurzenie')).toBeInTheDocument()
      expect(screen.getByText('10 km/h SW')).toBeInTheDocument()
      expect(screen.getByText('56%')).toBeInTheDocument()
      expect(screen.getByText('1013 hPa')).toBeInTheDocument()
      expect(screen.getByText('13° / 26°')).toBeInTheDocument()
      expect(screen.getByText('2.3 mm · 2%')).toBeInTheDocument()
      expect(screen.getByText('Open-Meteo')).toBeInTheDocument()
    })

    it('pogoda „bezchmurnie” pokazuje słońce (tarcza + promienie), nie sierp księżyca', () => {
      if (READY_WEATHER.status !== 'ready') throw new Error('fixture')
      const clear = { ...READY_WEATHER.weather, current: { ...READY_WEATHER.weather.current, weatherCode: 0 } }
      renderAside({ weather: { ...READY_WEATHER, weather: clear } })
      // eslint-disable-next-line testing-library/no-node-access -- ikona pogody jest dekoracyjna (aria-hidden), bez roli do zapytania
      const icon = document.querySelector('svg[width="32"]')
      // eslint-disable-next-line testing-library/no-node-access -- j.w.: sprawdzamy sam rysunek (tarcza + promienie)
      expect(icon?.querySelector('circle')).not.toBeNull()
      // eslint-disable-next-line testing-library/no-node-access -- j.w.
      expect(icon?.querySelectorAll('path').length).toBeGreaterThan(0)
    })
  })

  describe('mapa stacji', () => {
    it('pokazuje pin, gdy znamy lokalizację stacji', () => {
      renderAside()
      expect(screen.getByRole('region', { name: 'Mapa stacji Warszawa Centralna' })).toBeInTheDocument()
    })

    it('nie renderuje karty mapy bez znanej lokalizacji', () => {
      renderAside({ location: null })
      expect(screen.queryByRole('region', { name: /Mapa stacji/ })).not.toBeInTheDocument()
    })

    it('StationAside: map pin uses the station location (useRailStations), not weather', () => {
      // Pogoda zna INNY punkt, a w ogóle nie jest potrzebna: pin idzie z `location`.
      renderAside({ weather: { ...READY_WEATHER, location: { lat: 1, lon: 2 } } })
      expect(mapSpy.pins).toMatchObject([{ id: '33605', lat: LOCATION.lat, lon: LOCATION.lon }])

      renderAside({ weather: { status: 'error' } })
      expect(mapSpy.pins).toMatchObject([{ lat: LOCATION.lat, lon: LOCATION.lon }])
    })
  })

  describe('w arkuszu „Info” (telefon)', () => {
    function renderInSheet() {
      stubDialogMethods()
      render(
        <InfoSheet title="Informacje o stacji" onClose={vi.fn()}>
          <StationAside
            insights={INSIGHTS}
            disruptionMessages={[]}
            destinationFilter={null}
            onDestinationFilter={vi.fn()}
            loading={false}
            currentHour={8}
            weather={READY_WEATHER}
            location={LOCATION}
            stationName="Warszawa Centralna"
            stationId="33605"
            mapPreview={[]}
            stats={undefined}
          />
        </InfoSheet>
      )
    }

    it('kolejność briefu §8: utrudnienia → statystyki → pogoda → mapa → legenda; bez listy kierunków (filtr jest nad tablicą)', () => {
      renderInSheet()
      expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
        'Utrudnienia na tej stacji',
        'Statystyki stacji dzisiaj',
        'Pogoda dziś — Warszawa Centralna',
        'Mapa',
        'Legenda statusów',
      ])
      expect(screen.queryByText('Najpopularniejsze kierunki')).not.toBeInTheDocument()
      expect(screen.queryByText('Kraków Główny')).not.toBeInTheDocument()
    })

    it('statystyki (KPI + natężenie) i mapa zwinięte; mapa montuje się dopiero po rozwinięciu sekcji', () => {
      renderInSheet()
      expect(screen.queryByTestId('station-stats')).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Mapa stacji Warszawa Centralna' })).not.toBeInTheDocument()
      expect(screen.getByText('Brak zgłoszonych utrudnień dla tej stacji.')).toBeInTheDocument()

      const open = (title: string) => fireEvent.click(screen.getByRole('button', { name: title }))
      open('Statystyki stacji dzisiaj')
      expect(screen.getByTestId('station-stats')).toBeInTheDocument()
      expect(screen.getByText('Natężenie ruchu')).toBeInTheDocument()
      open('Mapa')
      expect(screen.getByRole('region', { name: 'Mapa stacji Warszawa Centralna' })).toBeInTheDocument()
    })
  })
})

describe('PopularDestinations', () => {
  const INSIGHTS = {
    topDestinations: [
      { stationId: '1', name: 'Kraków', count: 24 },
      { stationId: '2', name: 'Gdańsk', count: 1 },
    ],
    hourlyTraffic: new Array(24).fill(0),
  } as unknown as StationInsights

  it('variant="chips": a pressed-state group of name-only buttons that toggles the filter', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<PopularDestinations variant="chips" insights={INSIGHTS} loading={false} onSelect={onSelect} selected="Kraków" />)
    const group = screen.getByRole('group', { name: 'Najpopularniejsze kierunki' })
    const kraków = within(group).getByRole('button', { name: 'Kraków' })
    expect(kraków).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Gdańsk' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(kraków)
    expect(onSelect).toHaveBeenCalledWith(null)
    await user.click(within(group).getByRole('button', { name: 'Gdańsk' }))
    expect(onSelect).toHaveBeenCalledWith('Gdańsk')
  })

  it('variant="chips": renders nothing when there are no destinations, loading or failed (the board stays uncluttered)', () => {
    const { container, rerender } = render(<PopularDestinations variant="chips" insights={undefined} loading={false} onSelect={vi.fn()} selected={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<PopularDestinations variant="chips" insights={undefined} loading onSelect={vi.fn()} selected={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('default variant is the list with counts and keeps the loading / failed messages', () => {
    const { rerender } = render(<PopularDestinations insights={INSIGHTS} loading={false} onSelect={vi.fn()} selected={null} />)
    expect(screen.getByRole('button', { name: /Kraków/ })).toHaveTextContent('Kraków 24 połączenia')
    rerender(<PopularDestinations insights={undefined} loading onSelect={vi.fn()} selected={null} />)
    expect(screen.getByText('Wczytywanie rozkładu…')).toBeInTheDocument()
    rerender(<PopularDestinations insights={undefined} loading={false} onSelect={vi.fn()} selected={null} />)
    expect(screen.getByText(/Nie udało się pobrać rozkładu/)).toBeInTheDocument()
  })
})
