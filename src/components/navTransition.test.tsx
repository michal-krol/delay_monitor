// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Zastępnik `ViewTransition`: test sprawdza, JAKIE właściwości dostaje (nazwa, mapa typów), nie przeglądarkę.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    ViewTransition: (props: { children?: React.ReactNode }) =>
      actual.createElement('div', { 'data-testid': 'vt', 'data-props': JSON.stringify({ ...props, children: undefined }) }, props.children),
  }
})
// `Link` z `transitionTypes` widocznym w DOM.
vi.mock('next/link', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ href, transitionTypes, children, ...rest }: { href: string; transitionTypes?: string[]; children?: React.ReactNode }) =>
      createElement('a', { href, 'data-types': transitionTypes?.join(','), ...rest }, children),
  }
})
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))

import { Breadcrumb } from './Breadcrumb'
import { BottomNav } from './BottomNav'
import { NavList } from './navItems'
import { NavTransition } from './NavTransition'
import { PlaceTitle } from './PlaceTitle'
import { TopBar } from './TopBar'
import { NAV_BACK, NAV_FORWARD, NAV_FORWARD_OPTIONS, NAV_TAB } from '@/lib/navTransition'

function transitionProps(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('vt').getAttribute('data-props') ?? '{}')
}

describe('navigation transition types', () => {
  it('exposes the three types and a router.push options object for forward navigation', () => {
    expect([NAV_FORWARD, NAV_BACK, NAV_TAB]).toEqual(['nav-forward', 'nav-back', 'nav-tab'])
    expect(NAV_FORWARD_OPTIONS).toEqual({ transitionTypes: ['nav-forward'] })
  })

  it('the back arrow and the parent breadcrumb slide back', () => {
    render(<TopBar backLabel="Wróć do Pulpitu" backHref="/" crumbs={[{ label: 'Pulpit', href: '/' }, { label: 'Kraków Główny' }]} />)
    expect(screen.getByRole('link', { name: 'Wróć do Pulpitu' })).toHaveAttribute('data-types', 'nav-back')
    expect(screen.getByRole('link', { name: 'Pulpit' })).toHaveAttribute('data-types', 'nav-back')
  })

  it('a breadcrumb alone marks parent links as back', () => {
    render(<Breadcrumb items={[{ label: 'Miasto', href: '/city/warszawa' }, { label: 'Linia 20' }]} />)
    expect(screen.getByRole('link', { name: 'Miasto' })).toHaveAttribute('data-types', 'nav-back')
  })

  it('bottom-nav tabs and sidebar items crossfade (nav-tab), they are not forward/back', () => {
    render(<BottomNav />)
    for (const link of within(screen.getByRole('navigation', { name: 'Nawigacja główna' })).getAllByRole('link')) {
      expect(link).toHaveAttribute('data-types', 'nav-tab')
    }
  })

  it('sidebar nav list links also carry nav-tab', () => {
    render(<NavList activeItem="pulpit" />)
    for (const link of screen.getAllByRole('link')) expect(link).toHaveAttribute('data-types', 'nav-tab')
  })
})

describe('NavTransition', () => {
  it('maps each nav type to its animation and does nothing for untyped navigations', () => {
    render(
      <NavTransition>
        <p>treść</p>
      </NavTransition>
    )
    const props = transitionProps()
    expect(props.default).toBe('none')
    for (const key of ['enter', 'exit']) {
      expect(props[key]).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', 'nav-tab': 'nav-tab', default: 'none' })
    }
    expect(screen.getByText('treść')).toBeInTheDocument()
  })

})

describe('PlaceTitle', () => {
  it('names the shared element per place and morphs only that pair', () => {
    render(
      <PlaceTitle kind="pkp" id="33605">
        <h2>Warszawa Centralna</h2>
      </PlaceTitle>
    )
    expect(transitionProps()).toMatchObject({ name: 'place-pkp-33605', share: 'morph', default: 'none' })
  })

  it('different places and kinds never share a name (a duplicate name aborts the whole transition)', () => {
    const names = new Set<string>()
    for (const [kind, id] of [['pkp', '1001'], ['gtfs', '1001'], ['pkp', '1002']] as const) {
      const view = render(
        <PlaceTitle kind={kind} id={id}>
          <h2>x</h2>
        </PlaceTitle>
      )
      names.add(String(transitionProps().name))
      view.unmount()
    }
    expect(names.size).toBe(3)
  })

})
