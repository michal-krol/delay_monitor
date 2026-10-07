// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardApiRow } from '@/hooks/useBoard'
import type { GtfsDeparture } from '@/lib/gtfs/types'

// Który element dostaje ref animacji wierszy — samą animację testuje `useRowAnimation.test.tsx`.
const attached = vi.hoisted(() => [] as string[])
vi.mock('@/hooks/useRowAnimation', () => ({
  useRowAnimation: () => (element: HTMLElement | null) => {
    if (element !== null) attached.push(element.tagName)
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { BoardRowList } from './BoardRowList'
import { BoardTable } from './BoardTable'
import { TransitDepartureList } from './TransitDepartureList'

const NOW = Date.parse('2026-08-01T12:00:00+02:00')

function boardRow(trainNumber: string): BoardApiRow {
  return {
    scheduleId: '1',
    orderId: trainNumber,
    operatingDate: '2026-08-01',
    trainNumber,
    trainLabel: `IC ${trainNumber}`,
    carrier: 'IC',
    carrierName: null,
    category: 'IC',
    categoryName: null,
    headsign: 'Kraków',
    plannedAt: '2026-08-01T12:30:00+02:00',
    actualAt: null,
    delayMinutes: null,
    status: 'unknown',
    platform: '1',
    estimatedDelayMinutes: null,
  }
}

function departure(tripId: string): GtfsDeparture {
  return { tripId, stopId: 's1', line: '20', mode: 'bus', lineKind: 'regular', headsign: 'Centrum', plannedAt: '2026-08-01T12:30:00+02:00', frequencyBased: false, onRequest: false } as unknown as GtfsDeparture
}

beforeEach(() => {
  attached.length = 0
})

describe('row animation wiring', () => {
  it('BoardTable animates its tbody', () => {
    render(<BoardTable stationName="Kraków Główny" direction="departures" rows={[boardRow('1')]} now={NOW} loading={false} />)
    expect(attached).toContain('TBODY')
  })

  it('BoardTable keeps one row per train when rows come and go', () => {
    const view = render(<BoardTable stationName="Kraków Główny" direction="departures" rows={[boardRow('1'), boardRow('2')]} now={NOW} loading={false} />)
    view.rerender(<BoardTable stationName="Kraków Główny" direction="departures" rows={[boardRow('2'), boardRow('3')]} now={NOW} loading={false} />)
    expect(screen.getAllByRole('button', { name: /^IC \d$/ }).map((button) => button.getAttribute('aria-label'))).toEqual(['IC 2', 'IC 3'])
  })

  it('TransitDepartureList animates its departure list', () => {
    render(<TransitDepartureList departures={[departure('a'), departure('b')]} />)
    expect(attached).toContain('UL')
  })

  it('BoardRowList animates its list', () => {
    render(<BoardRowList rows={[boardRow('1')]} now={NOW} loading={false} showEmpty={false} emptyMessage="Brak" />)
    expect(attached).toContain('UL')
  })
})
