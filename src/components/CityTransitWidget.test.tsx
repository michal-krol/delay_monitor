// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CityTransitWidget } from './CityTransitWidget'
import type { CityStatsResponse } from '@/hooks/useCityStats'
import type { CityStats } from '@/lib/gtfs/query'

const hookState = vi.hoisted(() => ({ current: { data: null as CityStatsResponse | null, error: null as string | null } }))
vi.mock('@/hooks/useCityStats', () => ({ useCityStats: () => hookState.current }))

const stats: CityStats = {
  linesByMode: { metro: 2, tram: 25, bus: 140, rail: 0, other: 0 },
  busKinds: { regular: 120, night: 15, express: 5, replacement: 0 },
  stopGroupCount: 1200,
  modeCount: 3,
  tripsToday: 5000,
  firstDepartureSec: 14400,
  lastDepartureSec: 93600,
  hourly: new Array(24).fill(10),
}

afterEach(() => {
  hookState.current = { data: null, error: null }
})

describe('CityTransitWidget', () => {
  it('shows a loading note before data arrives', () => {
    render(<CityTransitWidget city="warszawa" cityName="Warszawa" />)
    expect(screen.getByText('Komunikacja miejska — Warszawa')).toBeInTheDocument()
    expect(screen.getByText('Wczytuję rozkład…')).toBeInTheDocument()
  })

  it('lists line counts per mode with the bus-kind breakdown', () => {
    hookState.current = { data: { city: 'warszawa', state: 'ready', stats }, error: null }
    render(<CityTransitWidget city="warszawa" cityName="Warszawa" />)
    expect(screen.getByText('metro')).toBeInTheDocument()
    expect(screen.getByText(/15 nocnych/)).toBeInTheDocument()
    expect(screen.getByText(/5 przyspieszonych/)).toBeInTheDocument()
    // kolej strefowa ma 0 linii — wiersz odsiany
    expect(screen.queryByText('kolej strefowa')).not.toBeInTheDocument()
    expect(screen.getByText(/Pierwszy kurs 04:00, ostatni 02:00/)).toBeInTheDocument()
  })

  it('shows "W trasie teraz" with the total and per-mode split when the vehicle feed is ready', () => {
    hookState.current = {
      data: {
        city: 'warszawa',
        state: 'ready',
        stats,
        vehiclesInService: { metro: 4, tram: 10, bus: 30, rail: 0, other: 0 },
        vehiclesUnmatched: 2,
        vehicleFeed: { state: 'ready', ageMs: 5000 },
      },
      error: null,
    }
    render(<CityTransitWidget city="warszawa" cityName="Warszawa" />)
    expect(screen.getByText(/W trasie teraz/)).toBeInTheDocument()
    expect(screen.getByText('44')).toBeInTheDocument()
    expect(screen.getByText(/4 metro · 10 tram · 30 autobus/)).toBeInTheDocument()
  })

  it('shows "—" (never 0) for "W trasie teraz" when the vehicle feed is not ready', () => {
    hookState.current = {
      data: { city: 'warszawa', state: 'ready', stats, vehiclesInService: null, vehiclesUnmatched: null, vehicleFeed: { state: 'loading', ageMs: null } },
      error: null,
    }
    render(<CityTransitWidget city="warszawa" cityName="Warszawa" />)
    const line = screen.getByText(
      (_, el) => el?.tagName === 'P' && /W trasie teraz/.test(el.textContent ?? ''),
    )
    expect(line.textContent).toContain('—')
    expect(line.textContent).not.toContain('0')
  })

  it('shows an error note when stats cannot load', () => {
    hookState.current = { data: { city: 'warszawa', state: 'failed', stats: null }, error: 'boom' }
    render(<CityTransitWidget city="warszawa" cityName="Warszawa" />)
    expect(screen.getByText('Nie udało się wczytać statystyk.')).toBeInTheDocument()
  })

  it('shows "Wczytuję…" for the alert card before the feed is ready', () => {
    hookState.current = { data: { city: 'warszawa', state: 'ready', stats, alerts: null, alertFeed: { state: 'loading', ageMs: null } }, error: null }
    render(<CityTransitWidget city="warszawa" cityName="Warszawa" />)
    expect(screen.getByText('Utrudnienia')).toBeInTheDocument()
    expect(screen.getByText('Wczytuję…')).toBeInTheDocument()
  })

  it('shows "Brak aktywnych utrudnień." when the feed is ready with zero alerts', () => {
    hookState.current = { data: { city: 'warszawa', state: 'ready', stats, alerts: [], alertFeed: { state: 'ready', ageMs: 1000 } }, error: null }
    render(<CityTransitWidget city="warszawa" cityName="Warszawa" />)
    expect(screen.getByText('Brak aktywnych utrudnień.')).toBeInTheDocument()
  })

  it('lists active alert titles with a count when the feed has entries', () => {
    hookState.current = {
      data: {
        city: 'warszawa',
        state: 'ready',
        stats,
        alerts: [
          { id: 'a', routes: ['20'], effect: 'DETOUR', link: '', title: 'Utrudnienia na linii 20', body: 'b' },
          { id: 'b', routes: ['185'], effect: 'OTHER_EFFECT', link: '', title: 'Utrudnienia na linii 185', body: 'b' },
        ],
        alertFeed: { state: 'ready', ageMs: 1000 },
      },
      error: null,
    }
    render(<CityTransitWidget city="warszawa" cityName="Warszawa" />)
    expect(screen.getByText(/2 aktywne utrudnienia/)).toBeInTheDocument()
    expect(screen.getByText('Utrudnienia na linii 20')).toBeInTheDocument()
    expect(screen.getByText('Utrudnienia na linii 185')).toBeInTheDocument()
  })
})
