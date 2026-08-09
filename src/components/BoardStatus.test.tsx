// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BoardStatus } from './BoardStatus'
import type { BoardApiResponse } from '@/hooks/useBoard'

function makeData(overrides: Partial<BoardApiResponse> = {}): BoardApiResponse {
  return {
    snapshots: [],
    budget: { hourly: 90, daily: 900 },
    status: 'ok',
    throttled: false,
    ...overrides,
  }
}

const FETCHED_AT = '2026-08-01T20:24:11.827Z'

describe('BoardStatus', () => {
  it('reports the loading state before the first snapshot arrives', () => {
    render(<BoardStatus fetchedAt={undefined} ageMs={undefined} data={null} error={false} />)
    expect(screen.getByText('Ładowanie…')).toBeInTheDocument()
  })

  it('reports a fetch error', () => {
    render(<BoardStatus fetchedAt={undefined} ageMs={undefined} data={null} error={true} />)
    expect(screen.getByText('Błąd pobierania danych')).toBeInTheDocument()
  })

  it('shows the refresh-cadence note even while still loading, not just once data has arrived', () => {
    render(<BoardStatus fetchedAt={undefined} ageMs={undefined} data={null} error={false} />)
    expect(screen.getByText('Dane odświeżają się automatycznie co ok. 1,5 minuty.')).toBeInTheDocument()
  })

  it('shows the refresh-cadence note even during a fetch error', () => {
    render(<BoardStatus fetchedAt={undefined} ageMs={undefined} data={null} error={true} />)
    expect(screen.getByText('Dane odświeżają się automatycznie co ok. 1,5 minuty.')).toBeInTheDocument()
  })

  it('shows the absolute last-updated timestamp when everything is healthy', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} data={makeData()} error={false} />)

    expect(screen.getByText(/Ostatnia aktualizacja:/)).toBeInTheDocument()
    expect(screen.queryByText(/dane sprzed/)).not.toBeInTheDocument()
    expect(screen.queryByText(/odświeżanie ograniczone/)).not.toBeInTheDocument()
    expect(screen.queryByText(/API nie odpowiada/)).not.toBeInTheDocument()
  })

  it('always shows a short plain-language note about how often data refreshes', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} data={makeData()} error={false} />)
    expect(screen.getByText('Dane odświeżają się automatycznie co ok. 1,5 minuty.')).toBeInTheDocument()
  })

  it('spells out the data age once the snapshot goes stale', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={7 * 60 * 1000} data={makeData()} error={false} />)
    expect(screen.getByText('dane sprzed 7 min')).toBeInTheDocument()
  })

  it('switches to hours for a very old snapshot', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={95 * 60 * 1000} data={makeData()} error={false} />)
    expect(screen.getByText('dane sprzed 1 h 35 min')).toBeInTheDocument()
  })

  it('stays quiet about the age just below the staleness threshold', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={2 * 60 * 1000} data={makeData()} error={false} />)
    expect(screen.queryByText(/dane sprzed/)).not.toBeInTheDocument()
  })

  it('says the API is not answering when the poller reports degraded', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} data={makeData({ status: 'degraded' })} error={false} />)
    expect(screen.getByText(/API nie odpowiada/)).toBeInTheDocument()
  })

  it('flags throttled refreshing and names the remaining daily budget', () => {
    render(
      <BoardStatus
        fetchedAt={FETCHED_AT}
        ageMs={1000}
        data={makeData({ throttled: true, budget: { hourly: 3, daily: 41 } })}
        error={false}
      />
    )

    const chip = screen.getByText('odświeżanie ograniczone')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveAttribute('title', 'Pozostało 41 zapytań do API na dobę')
  })

  it('omits the budget tooltip when the API did not report a budget', () => {
    render(
      <BoardStatus
        fetchedAt={FETCHED_AT}
        ageMs={1000}
        data={makeData({ throttled: true, budget: { hourly: null, daily: null } })}
        error={false}
      />
    )

    expect(screen.getByText('odświeżanie ograniczone')).not.toHaveAttribute('title')
  })
})
