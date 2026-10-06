// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
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
import { StatTile } from './StatTile'

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
