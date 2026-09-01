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

  it('notStarted z prognozą PKP dokleja "· prognoza +N min" i tooltip', () => {
    const { unmount } = render(<DelayBadge status="notStarted" delayMinutes={null} predictedDelayMinutes={74} />)
    const badge = screen.getByText('jeszcze nie wyjechał · prognoza +74 min')
    expect(badge).toBeInTheDocument()
    expect(badge.getAttribute('title')).toMatch(/prognoza pkp/i)
    unmount()

    // Działa też z brzmieniem przyjazdowym.
    render(<DelayBadge status="notStarted" delayMinutes={null} direction="arrival" predictedDelayMinutes={12} />)
    expect(screen.getByText('jeszcze nie przyjechał · prognoza +12 min')).toBeInTheDocument()
  })

  it('notStarted bez prognozy (albo prognoza < 1 min) to sama etykieta, bez tooltipa', () => {
    for (const predicted of [null, 0, -3]) {
      const { unmount } = render(
        <DelayBadge status="notStarted" delayMinutes={null} predictedDelayMinutes={predicted} />
      )
      const badge = screen.getByText('jeszcze nie wyjechał')
      expect(badge).not.toHaveAttribute('title')
      unmount()
    }
  })

  it('ignoruje predictedDelayMinutes dla statusów innych niż notStarted', () => {
    for (const status of ['onTime', 'delayed', 'cancelled', 'unknown', 'enRoute'] as const) {
      const { container, unmount } = render(
        <DelayBadge status={status} delayMinutes={5} predictedDelayMinutes={40} />
      )
      expect(container.textContent, `status ${status}`).not.toMatch(/prognoza/)
      unmount()
    }
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
    // Uwaga: to musi sprawdzać kolor, nie tekst — teksty i tak różnią się per
    // status (LABELS), więc porównanie oparte na tekście (np. outerHTML) nigdy
    // by nie wykryło regresji koloru, np. notStarted przypadkiem dzielącego
    // token z unknown (dokładnie ten historyczny błąd, patrz komentarz przy TOKENS).
    const textByStatus: Record<(typeof STATUSES)[number], string> = {
      onTime: 'punktualnie',
      delayed: '+1 min',
      cancelled: 'odwołany',
      unknown: 'brak danych',
      notStarted: 'jeszcze nie wyjechał',
      enRoute: 'w trasie',
    }

    const backgrounds = STATUSES.map((status) => {
      const { unmount } = render(<DelayBadge status={status} delayMinutes={1} />)
      const bg = screen.getByText(textByStatus[status]).style.backgroundColor
      unmount()
      return bg
    })

    expect(new Set(backgrounds).size).toBe(STATUSES.length)
  })

  it('używa nasyconych plakietek z tokenów CSS, tych samych w obu motywach', () => {
    const { container } = render(<DelayBadge status="delayed" delayMinutes={5} />)
    const html = container.firstElementChild?.outerHTML ?? ''
    expect(html).toContain('var(--status-delayed-bg)')
    expect(html).toContain('var(--status-delayed-fg)')
  })
})

describe('DelayBadge — wariant tekstowy', () => {
  it('używa tokenu tekstowego jako koloru, nie jako tła', () => {
    render(<DelayBadge status="delayed" delayMinutes={4} variant="text" />)
    const badge = screen.getByText('+4 min')
    expect(badge).toHaveStyle({ color: 'var(--status-delayed-text)' })
    expect(badge.style.backgroundColor).toBe('')
  })

  it('domyślnie zostaje pigułką, żeby istniejące użycia się nie zmieniły', () => {
    render(<DelayBadge status="delayed" delayMinutes={4} />)
    expect(screen.getByText('+4 min')).toHaveStyle({ backgroundColor: 'var(--status-delayed-bg)' })
  })

  it('mówi to samo co pigułka — wariant zmienia wygląd, nigdy treść', () => {
    for (const status of STATUSES) {
      const utils = render(<DelayBadge status={status} delayMinutes={5} />)
      const pillText = utils.baseElement.textContent
      utils.unmount()
      const view = render(<DelayBadge status={status} delayMinutes={5} variant="text" />)
      expect(view.baseElement.textContent, `status ${status}`).toBe(pillText)
      view.unmount()
    }
  })

  // Zastrzeżenie „to szacunek, nie fakt" nie może zniknąć razem z pigułką.
  it('zachowuje tooltip szacunku w wariancie tekstowym', () => {
    render(<DelayBadge status="enRoute" delayMinutes={null} estimatedDelayMinutes={4} variant="text" />)
    expect(screen.getByTitle(/szacunek/i)).toHaveTextContent('w trasie, ~+4 min')
  })
})
