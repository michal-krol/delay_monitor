// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DelayBadge } from './DelayBadge'

const STATUSES = ['onTime', 'delayed', 'cancelled', 'unknown', 'notStarted', 'enRoute'] as const

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
      notStarted: 'jeszcze nie wyjechał',
      enRoute: 'w trasie',
    }

    for (const [status, label] of Object.entries(expected)) {
      const { unmount } = render(<DelayBadge status={status as 'onTime'} delayMinutes={0} />)
      expect(screen.getByText(label)).toBeInTheDocument()
      unmount()
    }
  })

  it('nie pokazuje minut przy statusach, w których nie mają sensu', () => {
    // Odwołany pociąg z "+5 min" bylby mylacy — opoznienie dotyczy tylko delayed.
    for (const status of ['onTime', 'cancelled', 'unknown', 'notStarted', 'enRoute'] as const) {
      const { container, unmount } = render(<DelayBadge status={status} delayMinutes={5} />)
      expect(container.textContent, `status ${status}`).not.toContain('5 min')
      unmount()
    }
  })

  it('notStarted brzmi jak odjazd domyślnie, i jak przyjazd, gdy direction="arrival"', () => {
    const { unmount: unmount1 } = render(<DelayBadge status="notStarted" delayMinutes={null} />)
    expect(screen.getByText('jeszcze nie wyjechał')).toBeInTheDocument()
    unmount1()

    const { unmount: unmount2 } = render(<DelayBadge status="notStarted" delayMinutes={null} direction="departure" />)
    expect(screen.getByText('jeszcze nie wyjechał')).toBeInTheDocument()
    unmount2()

    const { unmount: unmount3 } = render(<DelayBadge status="notStarted" delayMinutes={null} direction="arrival" />)
    expect(screen.getByText('jeszcze nie przyjechał')).toBeInTheDocument()
    unmount3()
  })

  it('direction nie zmienia brzmienia statusów innych niż notStarted', () => {
    for (const status of ['onTime', 'delayed', 'cancelled', 'unknown', 'enRoute'] as const) {
      const { unmount: unmountDeparture, container: departureContainer } = render(
        <DelayBadge status={status} delayMinutes={5} direction="departure" />
      )
      const departureText = departureContainer.textContent
      unmountDeparture()

      const { unmount: unmountArrival, container: arrivalContainer } = render(
        <DelayBadge status={status} delayMinutes={5} direction="arrival" />
      )
      expect(arrivalContainer.textContent, `status ${status}`).toBe(departureText)
      unmountArrival()
    }
  })

  it('enRoute z estymatą pokazuje przybliżoną liczbę minut i tooltip z zastrzeżeniem', () => {
    render(<DelayBadge status="enRoute" delayMinutes={null} estimatedDelayMinutes={30} />)
    const badge = screen.getByText('w trasie, ~+30 min')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute('title')
    expect(badge.getAttribute('title')).toMatch(/potwierdzonej stacji/i)
  })

  it('enRoute z estymatą 0 (lub ujemną) pokazuje "punktualnie", nie mylące "~+0 min"', () => {
    const { unmount: unmount1 } = render(<DelayBadge status="enRoute" delayMinutes={null} estimatedDelayMinutes={0} />)
    expect(screen.getByText('w trasie, punktualnie')).toHaveAttribute('title')
    unmount1()

    const { unmount: unmount2 } = render(<DelayBadge status="enRoute" delayMinutes={null} estimatedDelayMinutes={-2} />)
    expect(screen.getByText('w trasie, punktualnie')).toBeInTheDocument()
    unmount2()
  })

  it('enRoute bez estymaty (domyślnie albo jawne null) wygląda jak dziś -- samo "w trasie", bez tooltipa', () => {
    const { unmount: unmount1 } = render(<DelayBadge status="enRoute" delayMinutes={null} />)
    const badge1 = screen.getByText('w trasie')
    expect(badge1).not.toHaveAttribute('title')
    unmount1()

    const { unmount: unmount2 } = render(<DelayBadge status="enRoute" delayMinutes={null} estimatedDelayMinutes={null} />)
    const badge2 = screen.getByText('w trasie')
    expect(badge2).not.toHaveAttribute('title')
    unmount2()
  })

  it('ignoruje estymatę dla statusów innych niż enRoute -- potwierdzone dane zawsze wygrywają', () => {
    render(<DelayBadge status="delayed" delayMinutes={5} estimatedDelayMinutes={30} />)
    expect(screen.getByText('+5 min')).toBeInTheDocument()
    expect(screen.queryByText(/~\+30/)).not.toBeInTheDocument()
  })

  it('rozróżnia statusy również kolorem (inline style z tokenów), jako dodatek do tekstu', () => {
    // Kolor jest wzmocnieniem, nie jedynym nosnikiem — ale ma faktycznie rozrozniac.
    const markup = STATUSES.map((status) => {
      const { container, unmount } = render(<DelayBadge status={status} delayMinutes={1} />)
      const html = container.firstElementChild?.outerHTML ?? ''
      unmount()
      return html
    })

    expect(new Set(markup).size).toBe(STATUSES.length)
  })

  it('używa nasyconych plakietek z tokenów CSS, tych samych w obu motywach', () => {
    const { container } = render(<DelayBadge status="delayed" delayMinutes={5} />)
    const html = container.firstElementChild?.outerHTML ?? ''
    expect(html).toContain('var(--status-delayed-bg)')
    expect(html).toContain('var(--status-delayed-fg)')
  })
})
