// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StationAside } from './StationAside'
import type { StationInsights } from '@/lib/board/stationStats'

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
    const labels = screen.getAllByRole('button').map((button) => button.textContent)

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
      <StationAside insights={undefined} disruptionMessages={[]} destinationFilter={null} onDestinationFilter={vi.fn()} loading currentHour={8} />
    )
    expect(screen.getAllByText('Wczytywanie rozkładu…')).toHaveLength(2)
    expect(screen.queryByText(/Nie udało się pobrać rozkładu/)).not.toBeInTheDocument()
    unmount()

    render(
      <StationAside insights={undefined} disruptionMessages={[]} destinationFilter={null} onDestinationFilter={vi.fn()} loading={false} currentHour={8} />
    )
    expect(screen.getAllByText(/Nie udało się pobrać rozkładu/)).toHaveLength(2)
  })

  it('separates "no disruptions reported" from the disruption list', () => {
    const { unmount } = render(
      <StationAside insights={INSIGHTS} disruptionMessages={[]} destinationFilter={null} onDestinationFilter={vi.fn()} loading={false} currentHour={8} />
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
})
