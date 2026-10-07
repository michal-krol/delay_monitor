// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Zastępnik `AnimatedNumber`: test sprawdza, KTÓRE liczby idą do animacji i z jakimi częściami napisu,
// a nie samą bibliotekę (jej zachowanie: `AnimatedNumber.test.tsx`).
vi.mock('./AnimatedNumber', () => ({
  AnimatedNumber: ({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) => (
    <span data-testid="animated" data-prefix={prefix} data-value={value} data-suffix={suffix}>
      {`${prefix}${value}${suffix}`}
    </span>
  ),
}))

import { DelayBadge } from './DelayBadge'
import { BoardTable } from './BoardTable'
import { StatTile } from './StatTile'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('DelayBadge animates only real numbers', () => {
  it('rolls the delay minutes of a delayed train', () => {
    render(<DelayBadge status="delayed" delayMinutes={5} />)
    const animated = screen.getByTestId('animated')
    expect(animated).toHaveAttribute('data-prefix', '+')
    expect(animated).toHaveAttribute('data-value', '5')
    expect(animated).toHaveAttribute('data-suffix', ' min')
    expect(screen.getByTestId('delay-badge')).toHaveTextContent('+5 min')
  })

  it('never invents a number for a delayed train without minutes (unknown is not +0)', () => {
    render(<DelayBadge status="delayed" delayMinutes={null} />)
    expect(screen.queryByTestId('animated')).not.toBeInTheDocument()
    expect(screen.getByTestId('delay-badge')).toHaveTextContent('opóźniony')
  })

  it('rolls the en-route estimate and the not-started forecast, keeping their words as prefix', () => {
    const view = render(<DelayBadge status="enRoute" delayMinutes={null} estimatedDelayMinutes={6} />)
    expect(screen.getByTestId('animated')).toHaveAttribute('data-prefix', 'w trasie, ~+')
    view.unmount()
    render(<DelayBadge status="notStarted" delayMinutes={null} predictedDelayMinutes={34} />)
    expect(screen.getByTestId('animated')).toHaveAttribute('data-prefix', 'jeszcze nie wyjechał · prognoza +')
  })

  it('renders plain text when told not to animate (long boards: no custom element per row)', () => {
    render(<DelayBadge status="delayed" delayMinutes={5} animated={false} />)
    expect(screen.queryByTestId('animated')).not.toBeInTheDocument()
    expect(screen.getByTestId('delay-badge')).toHaveTextContent('+5 min')
  })

  it.each([
    ['onTime', 'punktualnie'],
    ['cancelled', 'odwołany'],
    ['unknown', 'brak danych'],
  ] as const)('keeps %s as plain text', (status, text) => {
    render(<DelayBadge status={status} delayMinutes={null} />)
    expect(screen.queryByTestId('animated')).not.toBeInTheDocument()
    expect(screen.getByTestId('delay-badge')).toHaveTextContent(text)
  })

  it('an en-route estimate below one minute stays text', () => {
    render(<DelayBadge status="enRoute" delayMinutes={null} estimatedDelayMinutes={0} />)
    expect(screen.queryByTestId('animated')).not.toBeInTheDocument()
    expect(screen.getByTestId('delay-badge')).toHaveTextContent('w trasie, punktualnie')
  })
})

describe('StatTile animates numeric values only', () => {
  it('splits a signed value and a percentage into prefix, number and suffix', () => {
    const view = render(<StatTile label="Średnie opóźnienie" value="+6" unit="min" />)
    expect(screen.getByTestId('animated')).toHaveAttribute('data-prefix', '+')
    expect(screen.getByTestId('animated')).toHaveAttribute('data-value', '6')
    view.unmount()
    render(<StatTile label="Punktualność" value="92%" />)
    expect(screen.getByTestId('animated')).toHaveAttribute('data-suffix', '%')
  })

  it.each(['brak danych', '—'])('renders %j as plain text (unknown never becomes 0)', (value) => {
    render(<StatTile label="Punktualność" value={value} />)
    expect(screen.queryByTestId('animated')).not.toBeInTheDocument()
    expect(screen.getByText(value)).toBeInTheDocument()
  })
})

describe('BoardTable limits animated numbers on long boards', () => {
  function delayedRow(index: number) {
    return {
      scheduleId: '1',
      orderId: String(index),
      operatingDate: '2026-08-01',
      trainNumber: String(index),
      trainLabel: `IC ${index}`,
      carrier: 'IC',
      carrierName: null,
      category: 'IC',
      categoryName: null,
      headsign: 'Kraków',
      plannedAt: '2026-08-01T12:30:00+02:00',
      actualAt: null,
      delayMinutes: 5,
      status: 'delayed' as const,
      platform: '1',
      estimatedDelayMinutes: null,
    }
  }
  const NOW = Date.parse('2026-08-01T12:00:00+02:00')

  it('animates the delay minutes on a short board', () => {
    render(<BoardTable stationName="Kraków Główny" direction="departures" rows={[delayedRow(1), delayedRow(2)]} now={NOW} loading={false} />)
    expect(screen.getAllByTestId('animated')).toHaveLength(2)
  })

  it('renders plain minutes once the expanded board is long (one custom element per row is not free)', async () => {
    const rows = Array.from({ length: 60 }, (_, index) => delayedRow(index))
    render(<BoardTable stationName="Kraków Główny" direction="departures" rows={rows} now={NOW} loading={false} />)
    await userEvent.click(screen.getByRole('button', { name: /Pokaż więcej połączeń/ }))
    expect(screen.queryAllByTestId('animated')).toHaveLength(0)
    expect(screen.getAllByText('+5 min').length).toBeGreaterThan(40)
  })
})
