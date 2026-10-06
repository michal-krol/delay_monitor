// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatTile } from './StatTile'

describe('StatTile', () => {
  it('is a tile from sm and a pill below it: pill classes on one DOM, no second copy', () => {
    const { container } = render(<StatTile label="Odjazdy dzisiaj" value="128" hint="wg rozkładu" />)
    expect(screen.getAllByText('128')).toHaveLength(1)
    expect(container.firstElementChild).toHaveClass('max-sm:rounded-full', 'max-sm:py-1')
  })

  it('pills={false} (Info sheet) keeps the tile on every width', () => {
    const { container } = render(<StatTile label="Odjazdy dzisiaj" value="128" pills={false} />)
    expect(container.firstElementChild).not.toHaveClass('max-sm:rounded-full')
  })

  it('hides the icon and the hint in the pill, the unit only when asked', () => {
    render(<StatTile label="Odjazdy" value="2" unit="pociągi" hideUnitInPill icon={<svg data-testid="ico" />} accent="red" hint="wg rozkładu" />)
    expect(screen.getByTestId('ico').parentElement).toHaveClass('max-sm:hidden')
    expect(screen.getByText('wg rozkładu')).toHaveClass('max-sm:hidden')
    expect(screen.getByText('pociągi')).toHaveClass('max-sm:hidden')
  })

  it('works without an icon (stop summary): no empty icon slot', () => {
    const { container } = render(<StatTile label="Linie" value="—" uppercaseLabel />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(screen.getByText('Linie')).toHaveClass('uppercase', 'max-sm:normal-case')
  })
})
