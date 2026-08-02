// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DelayBadge } from './DelayBadge'

const STATUSES = ['onTime', 'delayed', 'cancelled', 'unknown'] as const

describe('DelayBadge', () => {
  it('opisuje każdy status tekstem, nigdy samym kolorem', () => {
    // Kluczowy niezmiennik dostępności całego projektu: użytkownik nierozróżniający
    // kolorów albo korzystający z czytnika ekranu musi dostać tę samą informację.
    for (const status of STATUSES) {
      const { container, unmount } = render(<DelayBadge status={status} delayMinutes={5} />)
      const text = container.textContent ?? ''

      expect(text.trim().length, `status ${status} bez tekstu`).toBeGreaterThan(0)
      unmount()
    }
  })

  it('podaje wielkość opóźnienia w minutach, nie samą etykietę', () => {
    render(<DelayBadge status="delayed" delayMinutes={12} />)
    expect(screen.getByText('+12 min')).toBeInTheDocument()
  })

  it('używa czytelnych polskich etykiet dla pozostałych statusów', () => {
    const expected: Record<Exclude<(typeof STATUSES)[number], 'delayed'>, string> = {
      onTime: 'punktualnie',
      cancelled: 'odwołany',
      unknown: 'brak danych',
    }

    for (const [status, label] of Object.entries(expected)) {
      const { unmount } = render(<DelayBadge status={status as 'onTime'} delayMinutes={0} />)
      expect(screen.getByText(label)).toBeInTheDocument()
      unmount()
    }
  })

  it('nie pokazuje minut przy statusach, w których nie mają sensu', () => {
    // Odwołany pociąg z "+5 min" bylby mylacy — opoznienie dotyczy tylko delayed.
    for (const status of ['onTime', 'cancelled', 'unknown'] as const) {
      const { container, unmount } = render(<DelayBadge status={status} delayMinutes={5} />)
      expect(container.textContent, `status ${status}`).not.toContain('5 min')
      unmount()
    }
  })

  it('rozróżnia statusy również kolorem, jako dodatek do tekstu', () => {
    // Kolor jest wzmocnieniem, nie jedynym nosnikiem — ale ma faktycznie rozrozniac.
    const classes = STATUSES.map((status) => {
      const { container, unmount } = render(<DelayBadge status={status} delayMinutes={1} />)
      const className = container.firstElementChild?.className ?? ''
      unmount()
      return className
    })

    expect(new Set(classes).size).toBe(STATUSES.length)
  })
})
