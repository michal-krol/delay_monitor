// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LineGrid } from './LineGrid'
import type { LineListEntry } from '@/lib/gtfs/query'

const entry = (routeId: string, mode: LineListEntry['mode']): LineListEntry => ({
  routeId,
  line: routeId,
  longName: `${routeId} długa`,
  color: null,
  textColor: '#000000',
  mode,
  kind: 'regular',
})

const lines = {
  metro: [entry('M1', 'metro')],
  tram: [entry('20', 'tram')],
  bus: [entry('128', 'bus')],
  rail: [],
  other: [],
}

describe('LineGrid', () => {
  it('links each line to its route page and keeps the accessible name', () => {
    render(<LineGrid linesByMode={lines} city="waw" filter="all" />)
    const link = screen.getByRole('link', { name: 'Linia M1 — M1 długa' })
    expect(link).toHaveAttribute('href', '/miasto/waw/linia/M1')
  })

  it('shows a section per mode with a count, ordered metro→tram→bus', () => {
    render(<LineGrid linesByMode={lines} city="waw" filter="all" />)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['metro · 1', 'tramwaj · 1', 'autobus · 1'])
  })

  it('filters to a single mode', () => {
    render(<LineGrid linesByMode={lines} city="waw" filter="tram" />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['tramwaj · 1'])
    expect(screen.queryByRole('link', { name: /M1/ })).not.toBeInTheDocument()
  })

  it('explains an empty filtered result instead of rendering nothing', () => {
    render(<LineGrid linesByMode={lines} city="waw" filter="rail" />)
    expect(screen.getByText('Feed nie zawiera linii tego rodzaju.')).toBeInTheDocument()
  })
})
