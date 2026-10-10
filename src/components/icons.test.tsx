// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomeIcon, TrainIcon, ArrowRightIcon, ShareIcon, InfoIcon, PauseIcon } from './icons'
import * as icons from './icons'
import { MOBILE_NAV_ITEMS } from './navItems'

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
    const { container } = render(<HomeIcon size={24} className="text-amber-500" />)
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

  it('każda ikona rysuje na siatce Lucide 24×24', () => {
    for (const [name, Icon] of all) {
      const { container, unmount } = render(<Icon />)
      expect(container.querySelector('svg'), name).toHaveAttribute('viewBox', '0 0 24 24')
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

  it('każda ikona ma obrys 2, zaokrąglone końce i kolor z tekstu', () => {
    for (const [name, Icon] of all) {
      const { container, unmount } = render(<Icon />)
      const svg = container.querySelector('svg')
      expect(svg, name).toHaveAttribute('stroke-width', '2')
      expect(svg, name).toHaveAttribute('stroke-linecap', 'round')
      expect(svg, name).toHaveAttribute('stroke', 'currentColor')
      unmount()
    }
  })

  it('słownik: Start/Mapa/Szukaj/Linie w nawigacji to osobne, nazwane ikony', () => {
    const byKey = Object.fromEntries(MOBILE_NAV_ITEMS.map((item) => [item.key, item.icon]))
    expect(byKey).toEqual({ start: icons.HomeIcon, map: icons.MapIcon, search: icons.SearchIcon, lines: icons.RouteIcon })
    expect(new Set(Object.values(byKey)).size).toBe(4)
  })

  it('słownik: lokalizacja użytkownika (LocateIcon) to nie „celność” (TargetIcon)', () => {
    expect(icons.LocateIcon).not.toBe(icons.TargetIcon)
    const draw = (Icon: (props: icons.IconProps) => React.ReactNode) => render(<Icon />).container.querySelector('svg')?.innerHTML
    expect(draw(icons.LocateIcon)).not.toBe(draw(icons.TargetIcon))
  })

  it('MetroIcon to własny piktogram: koło + „M” (bez oficjalnego logo metra)', () => {
    const svg = render(<icons.MetroIcon />).container.querySelector('svg')
    expect(svg?.querySelector('circle')).not.toBeNull()
    expect(svg?.querySelectorAll('path')).toHaveLength(1)
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

describe('icons — jedno źródło (Lucide, PR1)', () => {
  it('przypięte = wypełniona gwiazdka, nieprzypięte = kontur', () => {
    const filled = render(<icons.StarIcon filled />).container.querySelector('svg > :not(title)')
    expect(filled).toHaveAttribute('fill', 'currentColor')
    const outline = render(<icons.StarIcon />).container.querySelector('svg > :not(title)')
    expect(outline).not.toHaveAttribute('fill', 'currentColor')
  })

  it('kierunek jazdy pojazdu to wypełniona strzałka', () => {
    const shape = render(<icons.VehicleHeadingIcon />).container.querySelector('svg polygon')
    expect(shape).toHaveAttribute('fill', 'currentColor')
  })

  it('nowe pojęcia mają własne ikony', () => {
    for (const Icon of [icons.DeparturesBoardIcon, icons.SearchIcon, icons.VehiclePositionIcon, icons.DisclosureIcon]) {
      const { container, unmount } = render(<Icon />)
      expect(container.querySelector('svg')?.children.length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('skala rozmiarów według roli', () => {
    expect(icons.ICON_SIZE).toEqual({ chip: 13, inline: 14, button: 16, tile: 18 })
  })

  it('iconElement buduje dekoracyjny <svg> poza Reactem (mapa)', () => {
    const svg = icons.iconElement('chevronRight', { width: '14', height: '14' })
    expect(svg.tagName).toBe('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '14')
    expect(svg.childElementCount).toBeGreaterThan(0)
  })

  it('wielokąt strzałki kierunku pochodzi z węzła Lucide navigation-2', () => {
    expect(icons.VEHICLE_HEADING_POLYGON).toEqual([[12, 2], [19, 21], [12, 17], [5, 21], [12, 2]])
  })
})

describe('AppLogo — jedno źródło dla UI, favicony i ikon PWA', () => {
  it('w UI bierze gradient akcentu z tokenu CSS i zaokrąglenie 30%', () => {
    const logo = render(<icons.AppLogo size={40} />).container.firstElementChild as HTMLElement
    expect(logo.style.background).toBe('var(--accent-gradient)')
    expect(logo.style.borderRadius).toBe('12px')
  })

  it('trasa ikony podaje gradient wprost (brak CSS w ImageResponse) i może wyłączyć zaokrąglenie (iOS maskuje sam)', () => {
    const logo = render(<icons.AppLogo size={180} background={icons.ACCENT_GRADIENT} rounded={false} />).container.firstElementChild as HTMLElement
    expect(icons.ACCENT_GRADIENT).toBe('linear-gradient(135deg, #38bdf8, #6366f1)')
    expect(logo.style.background).toContain('linear-gradient')
    expect(logo.style.borderRadius).toBe('0px')
    // Satori (ImageResponse) układa tylko flexem — bez klas Tailwinda.
    expect(logo.style.display).toBe('flex')
  })
})

describe('icons — reguły pojęć wbudowane w ikony', () => {
  it('przypięta gwiazdka sama nosi PIN_COLOR, kontur nie (miejsca wywołań nie mogą o tym zapomnieć)', () => {
    expect(render(<icons.StarIcon filled className="shrink-0" />).container.querySelector('svg')).toHaveClass(icons.PIN_COLOR, 'shrink-0')
    expect(render(<icons.StarIcon />).container.querySelector('svg')).not.toHaveClass(icons.PIN_COLOR)
  })

  it('DisclosureIcon niesie klasę obrotu z globals.css i przepuszcza własne klasy', () => {
    const svg = render(<icons.DisclosureIcon className="ml-auto" />).container.querySelector('svg')
    expect(svg).toHaveClass('disclosure-chevron', 'ml-auto')
  })
})
