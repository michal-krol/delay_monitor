// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CityStatTiles } from './CityStatTiles'
import type { CityStats } from '@/lib/gtfs/query'

const stats: CityStats = {
  linesByMode: { metro: 2, tram: 20, bus: 100, rail: 3, other: 0 },
  busKinds: { regular: 90, night: 8, express: 2, replacement: 0, zone: 0, local: 0 },
  stopGroupCount: 1200,
  modeCount: 4,
  tripsToday: 4567,
  firstDepartureSec: 18000,
  lastDepartureSec: 90000,
  hourly: new Array(24).fill(1),
}

describe('CityStatTiles', () => {
  it('renders the four facts with grouped thousands', () => {
    render(<CityStatTiles stats={stats} loading={false} railStationCount={7} />)
    expect(screen.getByText('przystanki miejskie')).toBeInTheDocument()
    expect(screen.getByText((1200).toLocaleString('pl-PL'))).toBeInTheDocument()
    expect(screen.getByText((4567).toLocaleString('pl-PL'))).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('shows an em dash for unknown schedule facts while loading, never 0', () => {
    render(<CityStatTiles stats={null} loading railStationCount={5} />)
    // przystanki miejskie / środki transportu / połączenia dziś — nieznane
    expect(screen.getAllByText('—')).toHaveLength(3)
    // stacje kolejowe to znane 5, nie „—"
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('cities fetch failed → tile shows —', () => {
    render(<CityStatTiles stats={stats} loading={false} railStationCount={null} />)
    // stacje kolejowe nieznane (/api/cities zawiodło lub railStationsUnknown) — „—", nie 0.
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  describe('na telefonie (poniżej sm)', () => {
    const original = window.matchMedia
    beforeEach(() => {
      window.matchMedia = (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
    })
    afterEach(() => {
      window.matchMedia = original
    })

    it('zwija statystyki do jednej linii „Statystyki” (domyślnie zamknięte)', () => {
      render(<CityStatTiles stats={stats} loading={false} railStationCount={7} />)
      // `<details>` zamknięte: treść w DOM, ale niewidoczna dla użytkownika.
      expect(screen.getByText('Statystyki')).toBeVisible()
      expect(screen.getByText('przystanki miejskie')).not.toBeVisible()
    })

    it('nieznane liczby dalej jako „—”, nie 0', () => {
      render(<CityStatTiles stats={null} loading railStationCount={null} />)
      expect(screen.getAllByText('—')).toHaveLength(4)
    })
  })
})
