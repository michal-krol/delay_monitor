// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TimePair } from './TimePair'
import { formatClockTime } from '@/lib/format'
import type { BoardApiRow } from '@/hooks/useBoard'

const PLANNED = '2026-10-02T14:00:00+02:00'
const NOW = Date.parse('2026-10-02T13:42:00+02:00')

const ROW: BoardApiRow = {
  scheduleId: '1',
  orderId: '1',
  operatingDate: '2026-10-02',
  trainNumber: '1',
  trainLabel: 'IC 1',
  carrier: 'IC',
  carrierName: null,
  category: 'IC',
  categoryName: null,
  headsign: 'Kraków Główny',
  plannedAt: PLANNED,
  actualAt: null,
  estimatedDelayMinutes: null,
  delayMinutes: null,
  status: 'notStarted',
  platform: '3',
}

describe('TimePair', () => {
  it('plan line carries countdown "Plan 14:48 · za 18 min"', () => {
    const planned = '2026-10-02T14:00:00+02:00'
    render(<TimePair row={{ ...ROW, plannedAt: planned, predictedAt: '2026-10-02T14:00:00+02:00' }} now={NOW} />)
    expect(screen.getByText(`Plan ${formatClockTime(planned)} · za 18 min`)).toBeInTheDocument()
    expect(screen.getByText('Przew.')).toBeInTheDocument()
  })

  it('forecast: dominant time is the forecast, plan is the small line', () => {
    render(<TimePair row={{ ...ROW, predictedAt: '2026-10-02T14:12:00+02:00', status: 'enRoute' }} now={NOW} />)
    expect(screen.getByText(formatClockTime('2026-10-02T14:12:00+02:00'))).toBeInTheDocument()
    expect(screen.getByText(`Plan ${formatClockTime(PLANNED)} · za 30 min`)).toBeInTheDocument()
  })

  it('confirmed fact is labelled "Faktycznie" with the Plan line, even when equal to plan', () => {
    render(<TimePair row={{ ...ROW, actualAt: PLANNED, delayMinutes: 0, status: 'onTime' }} now={NOW} />)
    expect(screen.getByText('Faktycznie')).toBeInTheDocument()
    expect(screen.getByText(`Plan ${formatClockTime(PLANNED)} · za 18 min`)).toBeInTheDocument()
  })

  it('no realization: label "Plan" and only the countdown below, no second plan line', () => {
    render(<TimePair row={ROW} now={NOW} />)
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText('za 18 min')).toBeInTheDocument()
    expect(screen.queryByText(/^Plan \d/)).toBeNull()
  })

  it('no realization and outside the countdown window: just the time and "Plan"', () => {
    render(<TimePair row={{ ...ROW, plannedAt: '2026-10-02T16:00:00+02:00' }} now={NOW} />)
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.queryByText(/za \d+ min/)).toBeNull()
  })

  it('cancelled: plan time, no countdown, no forecast', () => {
    render(<TimePair row={{ ...ROW, status: 'cancelled', predictedAt: '2026-10-02T14:12:00+02:00' }} now={NOW} />)
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText(formatClockTime(PLANNED))).toBeInTheDocument()
    expect(screen.queryByText(/za \d+ min/)).toBeNull()
    expect(screen.queryByText('Przew.')).toBeNull()
  })

  it('compact: same data, smaller dominant time', () => {
    render(<TimePair row={{ ...ROW, predictedAt: '2026-10-02T14:12:00+02:00' }} now={NOW} compact />)
    const time = screen.getByText(formatClockTime('2026-10-02T14:12:00+02:00'))
    expect(time).toHaveClass('text-base')
    expect(time).not.toHaveClass('time-dominant')
    expect(screen.getByText(`Plan ${formatClockTime(PLANNED)} · za 30 min`)).toBeInTheDocument()
  })

  it('default size uses the shared time-dominant utility', () => {
    render(<TimePair row={ROW} now={NOW} />)
    expect(screen.getByText(formatClockTime(PLANNED))).toHaveClass('time-dominant')
  })
})
