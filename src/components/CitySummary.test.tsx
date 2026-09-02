// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CitySummary, type CitySummaryData } from './CitySummary'

const base: CitySummaryData = {
  railStations: [{ id: '1' }, { id: '2' }],
  schedule: { state: 'ready', ageMs: 5 * 60000, feedVersion: 'v1', serviceDates: ['a', 'b', 'c'] },
  lineCounts: { metro: 2, tram: 20, bus: 100, rail: 3, other: 0 },
  stopGroupCount: 1200,
}

describe('CitySummary', () => {
  it('shows schedule age, line/stop/station counts', () => {
    render(<CitySummary data={base} />)
    expect(screen.getByText(/rozkład 5 min temu/)).toBeInTheDocument()
    expect(screen.getByText(/2 stacje kolejowe/)).toBeInTheDocument()
    expect(screen.getByText(/1200 zespołów przystankowych/)).toBeInTheDocument()
    expect(screen.getByText(/125 linii \(2 metro, 20 tram, 100 autobus\)/)).toBeInTheDocument()
  })

  it('renders unknowns as absent, never as 0', () => {
    render(<CitySummary data={{ ...base, schedule: { state: 'loading', ageMs: null, feedVersion: null, serviceDates: null }, lineCounts: null, stopGroupCount: null }} />)
    expect(screen.getByText(/rozkład się wczytuje/)).toBeInTheDocument()
    expect(screen.queryByText(/0 linii/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0 zespołów/)).not.toBeInTheDocument()
  })
})
