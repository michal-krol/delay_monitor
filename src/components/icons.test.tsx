// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomeIcon, BellIcon, TrainIcon, ArrowRightIcon, ShareIcon, InfoIcon, PauseIcon } from './icons'

describe('icons', () => {
  it('renderuje się jako <svg> z domyślnym rozmiarem 18 i dziedziczonym kolorem', () => {
    const { container } = render(<HomeIcon />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('width', '18')
    expect(svg).toHaveAttribute('height', '18')
    expect(svg?.querySelector('[stroke="currentColor"], path[stroke="currentColor"]')).not.toBeNull()
  })

  it('przyjmuje niestandardowy rozmiar i className', () => {
    const { container } = render(<BellIcon size={24} className="text-amber-500" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('height', '24')
    expect(svg).toHaveClass('text-amber-500')
  })

  it('każda ikona ma aria-hidden — dekoracyjna, tekst obok niesie znaczenie', () => {
    const svg = render(<TrainIcon />).container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('icons — komplet z makiety szczegółów połączenia', () => {
  it('renderuje nowe ikony w tej samej konwencji co reszta pliku', () => {
    for (const [name, Icon] of Object.entries({ ArrowRightIcon, ShareIcon, InfoIcon, PauseIcon })) {
      const { container, unmount } = render(<Icon />)
      const svg = container.querySelector('svg')
      expect(svg, name).not.toBeNull()
      expect(svg, name).toHaveAttribute('aria-hidden', 'true')
      expect(svg?.querySelector('[stroke="currentColor"]'), name).not.toBeNull()
      unmount()
    }
  })
})
