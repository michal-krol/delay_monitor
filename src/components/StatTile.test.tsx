// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatTile } from './StatTile'

describe('StatTile', () => {
  it('is a tile from sm and a compact tile below it: pill classes on one DOM, no second copy', () => {
    render(<StatTile label="Odjazdy dzisiaj" value="128" hint="wg rozkładu" />)
    expect(screen.getAllByText('128')).toHaveLength(1)
    expect(screen.getByTestId('stat-tile')).toHaveClass('max-sm:rounded-2xl', 'max-sm:p-1')
  })

  it('pills={false} (Info sheet) keeps the tile on every width', () => {
    render(<StatTile label="Odjazdy dzisiaj" value="128" pills={false} />)
    expect(screen.getByTestId('stat-tile')).not.toHaveClass('max-sm:rounded-2xl')
  })

  it('hides the icon and the hint in the pill, keeps a smaller unit', () => {
    render(<StatTile label="Odjazdy" value="2" unit="pociągi" icon={<svg data-testid="ico" />} accent="red" hint="wg rozkładu" />)
    expect(screen.getByTestId('stat-tile-icon')).toHaveClass('max-sm:hidden')
    expect(screen.getByText('wg rozkładu')).toHaveClass('max-sm:hidden')
    expect(screen.getByText('pociągi')).toHaveClass('max-sm:text-xs')
  })

  it('works without an icon (stop summary): no empty icon slot', () => {
    render(<StatTile label="Linie" value="—" uppercaseLabel />)
    expect(screen.queryByTestId('stat-tile-icon')).toBeNull()
    expect(screen.getByText('Linie')).toHaveClass('uppercase', 'max-sm:normal-case')
  })
})
