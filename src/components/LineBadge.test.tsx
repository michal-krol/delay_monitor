// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LineBadge } from './LineBadge'
import { LINE_PALETTE } from './transitMode'

/** jsdom normalizuje `#rrggbb` do `rgb(...)` — porównujemy przez sondę. */
function css(property: 'backgroundColor' | 'color', value: string): string {
  const probe = document.createElement('div')
  probe.style[property] = value
  return probe.style[property]
}

describe('LineBadge', () => {
  it('renders a plain badge with no href', () => {
    render(<LineBadge line="20" kind="regular" mode="tram" />)
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('wraps in a link to the line details when href is given', () => {
    render(<LineBadge line="M1" kind="regular" mode="metro" href="/city/warszawa/line/M1" />)
    const link = screen.getByRole('link', { name: 'Linia M1' })
    expect(link).toHaveAttribute('href', '/city/warszawa/line/M1')
  })

  it('paints the category colour (mode + kind), never the feed colour', () => {
    render(<LineBadge line="M1" kind="regular" mode="metro" />)
    const metro = screen.getByText('M1')
    expect(metro.style.backgroundColor).toBe(css('backgroundColor', LINE_PALETTE.metro.bg))
    expect(metro.style.color).toBe(css('color', LINE_PALETTE.metro.fg))

    render(<LineBadge line="727" kind="zone" mode="bus" />)
    const zone = screen.getByText('727')
    expect(zone.style.backgroundColor).toBe(css('backgroundColor', LINE_PALETTE.zone.bg))
    expect(zone.style.color).toBe(css('color', LINE_PALETTE.zone.fg))
  })

  it('night and local badges get a light ring in dark mode (black / navy vanish on the dark surface)', () => {
    render(<LineBadge line="N32" kind="night" mode="bus" />)
    render(<LineBadge line="L-5" kind="local" mode="bus" />)
    render(<LineBadge line="131" kind="regular" mode="bus" />)
    expect(screen.getByText('N32')).toHaveClass('dark:ring-1')
    expect(screen.getByText('L-5')).toHaveClass('dark:ring-1')
    expect(screen.getByText('131')).not.toHaveClass('dark:ring-1')
  })
})
