// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CourseVehicleActions } from './CourseVehicleActions'

const observedAt = '2026-10-25T09:10:00+01:00'
const vehicle = { id: 'V/509/6', tripId: '2026-10-25:509:NdS:6:0900', serviceDate: '2026-10-25', sideNumber: '1234', observedAt, ageSec: 0, pastScheduledDeparture: true }

afterEach(() => vi.useRealTimers())
beforeEach(() => vi.useFakeTimers())

describe('CourseVehicleActions', () => {
  it('renders a noninteractive accessible clock and a separate exact-vehicle map link', () => {
    vi.setSystemTime(new Date(observedAt))
    render(<CourseVehicleActions city="warszawa" vehicle={vehicle} />)
    const status = screen.getByRole('img', { name: 'Po planowanym odjeździe' })
    expect(status).not.toHaveAttribute('tabindex')
    expect(status).not.toHaveAttribute('title')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('Po planowanym odjeździe')).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Pokaż pojazd 1234 na mapie' })
    expect(link).toHaveAttribute('href', expect.stringContaining('vehicle=V%2F509%2F6'))
    expect(link).toHaveAttribute('href', expect.stringContaining('trip=2026-10-25%3A509%3ANdS%3A6%3A0900'))
    expect(link).toHaveClass('min-h-[44px]', 'min-w-[44px]')
  })

  it('locates raw feed identity without an inferred service date or status', () => {
    vi.setSystemTime(new Date(observedAt))
    render(<CourseVehicleActions city="warszawa" vehicle={{ ...vehicle, serviceDate: undefined, pastScheduledDeparture: false }} />)
    expect(screen.getByRole('link', { name: 'Pokaż pojazd 1234 na mapie' })).toHaveAttribute('href', '/city/warszawa/map?vehicle=V%2F509%2F6&trip=2026-10-25%3A509%3ANdS%3A6%3A0900')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('expires status at 60 seconds and link at 180 seconds without a new payload', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    render(<CourseVehicleActions city="warszawa" vehicle={vehicle} />)
    act(() => vi.advanceTimersByTime(70_000))
    expect(screen.queryByRole('img', { name: 'Po planowanym odjeździe' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pokaż pojazd/ })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(120_000))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not interpret future, absent or unevaluated positions as late', () => {
    vi.setSystemTime(new Date('2026-10-25T09:09:00+01:00'))
    const { rerender } = render(<CourseVehicleActions city="warszawa" vehicle={vehicle} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    rerender(<CourseVehicleActions city="warszawa" vehicle={null} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    vi.setSystemTime(new Date(observedAt))
    rerender(<CourseVehicleActions city="warszawa" vehicle={{ ...vehicle, pastScheduledDeparture: false }} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
