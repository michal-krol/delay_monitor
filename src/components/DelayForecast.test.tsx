// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DelayForecast } from './DelayForecast'
import type { DelayPoint } from '@/lib/board/journey'

function point(stationName: string, delayMinutes: number | null, kind: DelayPoint['kind'] = 'fact'): DelayPoint {
  return { stationName, delayMinutes, kind }
}

const SERIES: DelayPoint[] = [point('Gdańsk Główny', 0), point('Iława', 4), point('Warszawa Centralna', 4, 'projection')]

function chart() {
  return screen.getByRole('img')
}

/** Ścieżki łamanej, w kolejności rysowania. */
function paths(): SVGPathElement[] {
  // Geometria SVG nie ma ról ARIA — to jedyny sposób sprawdzenia, że linia
  // jest przerwana (nieznane opóźnienie) i przerywana (prognoza).
  return Array.from(chart().querySelectorAll('path'))
}

describe('DelayForecast', () => {
  it('describes the whole series in text, so the chart is never the only carrier of the data', () => {
    render(<DelayForecast series={SERIES} arrivalTime="10:58" arrivalStatus="delayed" />)

    const label = chart().getAttribute('aria-label') ?? ''
    expect(label).toContain('Gdańsk Główny: na czas')
    expect(label).toContain('Iława: +4 min')
    expect(label).toContain('Warszawa Centralna: +4 min (prognoza)')
  })

  it('distinguishes projection from fact by line shape, not by colour alone', () => {
    render(<DelayForecast series={SERIES} arrivalTime="10:58" arrivalStatus="delayed" />)

    const dashed = paths().filter((path) => path.getAttribute('stroke-dasharray') !== null)
    const solid = paths().filter((path) => path.getAttribute('stroke-dasharray') === null)
    expect(dashed.length).toBeGreaterThan(0)
    expect(solid.length).toBeGreaterThan(0)
    expect(screen.getByText('prognoza')).toBeInTheDocument()
    expect(screen.getByText('fakt')).toBeInTheDocument()
  })

  it('omits the projection legend entirely when every point is a confirmed fact', () => {
    render(<DelayForecast series={[point('A', 0), point('B', 2)]} arrivalTime="10:58" arrivalStatus="onTime" />)

    expect(screen.queryByText('prognoza')).not.toBeInTheDocument()
  })

  // „Nie wiadomo" nigdy nie może zostać narysowane jako zero — to byłoby
  // zmyślenie faktu (AGENTS.md #2). Linia ma się przerwać.
  it('breaks the line at an unknown delay instead of drawing it as on-time', () => {
    const withGap = [point('A', 5), point('B', null), point('C', 5)]
    render(<DelayForecast series={withGap} arrivalTime="10:58" arrivalStatus="delayed" />)

    const solid = paths().filter((path) => path.getAttribute('stroke-dasharray') === null)
    expect(solid.length).toBe(2)
    expect(chart().getAttribute('aria-label') ?? '').not.toContain('B:')
  })

  it('says why there is no chart, instead of rendering an empty box', () => {
    render(<DelayForecast series={[point('A', null)]} arrivalTime={null} arrivalStatus="notStarted" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/Za mało danych/)).toBeInTheDocument()
  })

  it('shows the arrival time alongside the chart, as the mockup does', () => {
    render(<DelayForecast series={SERIES} arrivalTime="10:58" arrivalStatus="delayed" />)

    expect(screen.getByText('10:58')).toBeInTheDocument()
  })
})
