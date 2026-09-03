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

  it('lists line counts per mode with the bus-kind breakdown and no "in transit"', () => {
    hookState.current = { data: { city: 'warszawa', state: 'ready', stats }, error: null }
    render(<CityTransitWidget city="warszawa" cityName="Warszawa" />)
    expect(screen.getByText('metro')).toBeInTheDocument()
    expect(screen.getByText(/15 nocnych/)).toBeInTheDocument()
    expect(screen.getByText(/5 przyspieszonych/)).toBeInTheDocument()
    // kolej strefowa ma 0 linii — wiersz odsiany
    expect(screen.queryByText('kolej strefowa')).not.toBeInTheDocument()
    expect(screen.queryByText(/w trasie|w trakcie jazdy/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Pierwszy kurs 04:00, ostatni 02:00/)).toBeInTheDocument()
  })

  it('shows an error note when stats cannot load', () => {
    hookState.current = { data: { city: 'warszawa', state: 'failed', stats: null }, error: 'boom' }
    render(<CityTransitWidget city="warszawa" cityName="Warszawa" />)
    expect(screen.getByText('Nie udało się wczytać statystyk.')).toBeInTheDocument()
  })
})
