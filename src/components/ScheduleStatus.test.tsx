// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScheduleStatus, scheduleNeedsAttention } from './ScheduleStatus'
import type { TransitBoardResponse } from '@/hooks/useTransitBoard'

const headerData = vi.hoisted(() => vi.fn())
vi.mock('./pageHeader', () => ({ useHeaderData: headerData }))

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
    expect(screen.getByText(/Wczytywanie rozkładu — Warszawa/)).toBeInTheDocument()
    expect(screen.getByText(/rozkład przejazdów/)).toBeInTheDocument()
  })

  it('shows the shapes phase by its Polish label, not the raw English key', () => {
    render(<ScheduleStatus schedule={block({ state: 'loading', phase: 'shapes', ageMs: null, loadedAt: null })} cityName="Warszawa" />)
    expect(screen.queryByText(/· shapes/)).not.toBeInTheDocument()
    expect(screen.getByText(/kształty tras/)).toBeInTheDocument()
  })

  it('publishes the static schedule timestamp to the header without repeating a body title', () => {
    render(<ScheduleStatus schedule={block({})} cityName="Warszawa" />)
    expect(headerData).toHaveBeenCalledWith(expect.objectContaining({ label: 'Rozkład — Warszawa', updatedAt: '2026-09-02T09:00:00.000Z' }))
    expect(screen.queryByText(/Rozkład jazdy — Warszawa/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Aktualizacja:/)).not.toBeInTheDocument()
  })

  it('uses a custom title when given (line detail page)', () => {
    render(<ScheduleStatus schedule={block({})} cityName="Warszawa" title="Rozkład jazdy linii 20" />)
    expect(headerData).toHaveBeenCalledWith(expect.objectContaining({ label: 'Rozkład jazdy linii 20' }))
    expect(screen.queryByText(/Rozkład jazdy — Warszawa/)).not.toBeInTheDocument()
  })

  it('surfaces a failed refresh with the age of the still-served data', () => {
    render(<ScheduleStatus schedule={block({ state: 'failed', ageMs: 2 * 60 * 60 * 1000 })} cityName="Warszawa" />)
    expect(screen.getByText(/odświeżanie nie powiodło się/)).toBeInTheDocument()
    expect(screen.getByText(/odświeżanie nie powiodło się/)).toBeInTheDocument()
  })

  it('quiet: only the title and the update time, no warnings (they live on top of the page)', () => {
    render(<ScheduleStatus quiet schedule={block({ state: 'failed', ageMs: 2 * 60 * 60 * 1000 })} cityName="Warszawa" error />)
    expect(screen.queryByText(/Rozkład jazdy — Warszawa/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Aktualizacja: /)).not.toBeInTheDocument()
    expect(screen.queryByText(/dane sprzed/)).not.toBeInTheDocument()
    expect(screen.queryByText(/odświeżanie nie powiodło się/)).not.toBeInTheDocument()
  })
})

describe('ScheduleStatus staleness', () => {
  it('shows no "dane sprzed" chip for a ready schedule younger than 24 h', () => {
    render(<ScheduleStatus schedule={block({ ageMs: 3 * 60 * 60 * 1000 })} cityName="Warszawa" />)
    expect(screen.queryByText(/dane sprzed/)).not.toBeInTheDocument()
  })

  it('shows the chip once a ready schedule is a day old', () => {
    render(<ScheduleStatus schedule={block({ ageMs: 25 * 60 * 60 * 1000 })} cityName="Warszawa" />)
    expect(screen.getByText(/Rozkład wymaga aktualizacji/)).toBeInTheDocument()
  })
})

describe('scheduleNeedsAttention', () => {
  it('is false for a fresh, ready schedule', () => {
    expect(scheduleNeedsAttention(block({}), false)).toBe(false)
  })

  it('is true while loading, when failed, when stale (>= 24 h) and on a fetch error', () => {
    expect(scheduleNeedsAttention(block({ state: 'loading', ageMs: null, loadedAt: null }), false)).toBe(true)
    expect(scheduleNeedsAttention(block({ state: 'failed' }), false)).toBe(true)
    expect(scheduleNeedsAttention(block({ ageMs: 24 * 60 * 60 * 1000 }), false)).toBe(true)
    expect(scheduleNeedsAttention(block({}), true)).toBe(true)
  })

  it('does not nag about a static timetable that is merely hours old (it changes about once a day)', () => {
    expect(scheduleNeedsAttention(block({ ageMs: 24 * 60 * 60 * 1000 - 1 }), false)).toBe(false)
    expect(scheduleNeedsAttention(block({ ageMs: 3 * 60 * 60 * 1000 + 44 * 60 * 1000 }), false)).toBe(false)
  })
})
