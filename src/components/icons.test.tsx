// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomeIcon, BellIcon, TrainIcon, ArrowRightIcon, ShareIcon, InfoIcon, PauseIcon } from './icons'
import * as icons from './icons'

describe('icons', () => {
  it('renderuje się jako <svg> z domyślnym rozmiarem 18 i dziedziczonym kolorem', () => {
    const { container } = render(<HomeIcon />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('width', '18')
    expect(svg).toHaveAttribute('height', '18')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
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
      expect(svg, name).toHaveAttribute('stroke', 'currentColor')
      unmount()
    }
  })
})

describe('icons — arkusz (PR 7b: jeden styl, jedno pojęcie = jedna ikona)', () => {
  const all = Object.entries(icons).filter(([name]) => name.endsWith('Icon')) as [string, (props: icons.IconProps) => React.ReactNode][]

  it('każda ikona rysuje na viewBox 20×20', () => {
    for (const [name, Icon] of all) {
      const { container, unmount } = render(<Icon />)
      expect(container.querySelector('svg'), name).toHaveAttribute('viewBox', '0 0 20 20')
      unmount()
    }
  })

  it('bez `label` jest dekoracyjna: aria-hidden, bez roli', () => {
    for (const [name, Icon] of all) {
      const { container, unmount } = render(<Icon />)
      const svg = container.querySelector('svg')
      expect(svg, name).toHaveAttribute('aria-hidden', 'true')
      expect(svg, name).not.toHaveAttribute('role')
      unmount()
    }
  })

  it('z `label` jest znacząca: role="img" i aria-label, bez aria-hidden', () => {
    for (const [name, Icon] of all) {
      const { container, unmount } = render(<Icon label="Opis" />)
      const svg = container.querySelector('svg')
      expect(svg, name).toHaveAttribute('role', 'img')
      expect(svg, name).toHaveAttribute('aria-label', 'Opis')
      expect(svg, name).not.toHaveAttribute('aria-hidden')
      unmount()
    }
  })

  it('SunIcon rysuje słońce (tarcza + promienie), MoonIcon sierp (bez tarczy i promieni)', () => {
    const sun = render(<icons.SunIcon />).container.querySelector('svg')
    expect(sun?.querySelector('circle')).not.toBeNull()
    expect(sun?.querySelectorAll('path').length).toBeGreaterThan(0)
    const moon = render(<icons.MoonIcon />).container.querySelector('svg')
    expect(moon?.querySelector('circle')).toBeNull()
    expect(moon?.querySelectorAll('path')).toHaveLength(1)
  })
})
