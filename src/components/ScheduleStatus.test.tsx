// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScheduleStatus } from './ScheduleStatus'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'

type Block = TransitBoardResponse['schedule']
const block = (over: Partial<Block>): Block => ({
  state: 'ready',
  loadedAt: '2026-09-02T09:00:00.000Z',
  ageMs: 1000,
  phase: null,
  serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
  feedVersion: 'v1',
  ...over,
})

describe('ScheduleStatus', () => {
  it('shows the loading phase by name, not a second counter', () => {
    render(<ScheduleStatus schedule={block({ state: 'loading', phase: 'stop_times', ageMs: null, loadedAt: null })} cityName="Warszawa" />)
    expect(screen.getByText(/Wczytuję rozkład — Warszawa/)).toBeInTheDocument()
    expect(screen.getByText(/rozkład przejazdów/)).toBeInTheDocument()
  })

  it('shows the ready line with the service-day span', () => {
    render(<ScheduleStatus schedule={block({})} cityName="Warszawa" />)
    expect(screen.getByText(/Rozkład jazdy — Warszawa/)).toBeInTheDocument()
    expect(screen.getByText(/2026-09-01–2026-09-03/)).toBeInTheDocument()
  })

  it('surfaces a failed refresh with the age of the still-served data', () => {
    render(<ScheduleStatus schedule={block({ state: 'failed', ageMs: 2 * 60 * 60 * 1000 })} cityName="Warszawa" />)
    expect(screen.getByText(/dane sprzed 2 h/)).toBeInTheDocument()
    expect(screen.getByText(/odświeżanie nie powiodło się/)).toBeInTheDocument()
  })
})
