// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Page from './page'
import { __resetCityContext } from '@/hooks/useCityContext'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import type { DiscoveryResult } from '@/lib/discovery'
import { NAV_FORWARD_OPTIONS } from '@/lib/navTransition'
import { jsonResponse } from '@/test-utils/http'

const push = vi.fn()
const replace = vi.fn()
let searchParamsSeed = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(searchParamsSeed),
}))

type StubProps = {
  city: string | null
  initialQuery?: string
  autoFocus?: boolean
  onQueryChange?: (query: string) => void
  onSelect: (result: DiscoveryResult) => void
}
// Wyszukiwarka ma własne testy; tu tylko kontrakt strony: jakie propsy dostaje i co robi z ich callbackami.
let results: DiscoveryResult[] = []
vi.mock('@/components/UnifiedSearch', () => ({
  UnifiedSearch: ({ city, initialQuery, autoFocus, onQueryChange, onSelect }: StubProps) => (
    <div data-testid="unified" data-city={city ?? ''} data-autofocus={String(autoFocus === true)}>
      <input type="search" aria-label="pole" defaultValue={initialQuery} onChange={(event) => onQueryChange?.(event.target.value)} />
      {results.map((result, index) => (
        <button key={index} type="button" onClick={() => onSelect(result)}>
          {`wynik ${index}`}
        </button>
      ))}
    </div>
  ),
}))

const station = (id: string, count: number) => ({ id, name: id, railStations: Array.from({ length: count }, (_, i) => ({ id: String(i), name: `S${i}` })) })
const CITIES = { cities: [station('warszawa', 3), station('krakow', 1)].map((c) => ({ ...c, name: c.id === 'warszawa' ? 'Warszawa' : 'Kraków' })) }

function stubFetch(cities: unknown = CITIES) {
  vi.stubGlobal('fetch', vi.fn(() => jsonResponse(cities)))
}

beforeEach(() => {
  searchParamsSeed = ''
  results = []
  window.localStorage.clear()
  __resetCityContext()
  resetCitiesCacheForTests()
  window.history.replaceState(null, '', '/search')
  stubFetch()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const cityOf = () => screen.getByTestId('unified').getAttribute('data-city')

describe('/search page', () => {
  it('wraps in Suspense and shows the single h1 Szukaj', async () => {
    render(<Page />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Szukaj' })).toBeInTheDocument()
    expect(screen.getByText('Stacje, przystanki i linie')).toBeInTheDocument()
    expect(await screen.findByRole('searchbox', { name: 'pole' })).toHaveAttribute('type', 'search')
    expect(screen.getByTestId('unified')).toHaveAttribute('data-autofocus', 'true')
  })

  it('q from the URL is the initial phrase, truncated to 100 chars', async () => {
    searchParamsSeed = `q=${'a'.repeat(150)}`
    render(<Page />)
    expect(await screen.findByRole('searchbox')).toHaveValue('a'.repeat(100))
  })

  it('invalid city param is ignored in the UI', async () => {
    window.localStorage.setItem('monitor.cityContext.v2', JSON.stringify('krakow'))
    searchParamsSeed = 'city=WAW!'
    render(<Page />)
    await waitFor(() => expect(cityOf()).toBe('krakow'))
  })

  it('the city param is not trusted before the registry loads (no city, or the remembered one)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    searchParamsSeed = 'city=krakow'
    const { unmount } = render(<Page />)
    expect(await screen.findByTestId('unified')).toHaveAttribute('data-city', '')
    unmount()
    window.localStorage.setItem('monitor.cityContext.v2', JSON.stringify('warszawa'))
    __resetCityContext()
    render(<Page />)
    await waitFor(() => expect(cityOf()).toBe('warszawa'))
  })

  it('a known city param wins once the registry has loaded (deep link)', async () => {
    searchParamsSeed = 'city=krakow'
    render(<Page />)
    await waitFor(() => expect(cityOf()).toBe('krakow'))
  })

  it('an unknown city param never becomes the search city, not even for an instant', async () => {
    const seen: string[] = []
    searchParamsSeed = 'city=zzz'
    render(<Page />)
    seen.push(cityOf() ?? 'null')
    await waitFor(() => expect(cityOf()).toBe('warszawa'))
    seen.push(cityOf() ?? 'null')
    expect(seen).not.toContain('zzz')
  })

  it('shows the heading and subtitle on phones too (TopBar is not compact)', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1, name: 'Szukaj' }).className).not.toContain('sr-only')
  })

  it('unknown (registry) city param falls back to context/default once cities load', async () => {
    window.localStorage.setItem('monitor.cityContext.v2', JSON.stringify('krakow'))
    searchParamsSeed = 'city=gdansk'
    render(<Page />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Miasto' })).toHaveValue('krakow'))
    expect(cityOf()).toBe('krakow')
  })

  it('without context the default (largest) city is used', async () => {
    render(<Page />)
    await waitFor(() => expect(cityOf()).toBe('warszawa'))
  })

  it('typing writes q with replaceState and never pushes', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const pushState = vi.spyOn(window.history, 'pushState')
    window.history.replaceState(null, '', '/search?city=krakow')
    replaceState.mockClear()
    const user = userEvent.setup()
    render(<Page />)
    await user.type(await screen.findByRole('searchbox'), 'ab')
    expect(replaceState).toHaveBeenLastCalledWith(window.history.state, '', '/search?city=krakow&q=ab')
    await user.clear(screen.getByRole('searchbox'))
    expect(replaceState).toHaveBeenLastCalledWith(window.history.state, '', '/search?city=krakow')
    expect(pushState).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('choosing a city in the picker replaces the entry and keeps the phrase', async () => {
    searchParamsSeed = 'q=cent'
    const user = userEvent.setup()
    render(<Page />)
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Miasto' }), 'krakow')
    expect(replace).toHaveBeenCalledWith('/search?city=krakow&q=cent')
    expect(push).not.toHaveBeenCalled()
  })

  it('selecting a rail/stop/line pushes the discoveryHref with forward transition', async () => {
    results = [
      { kind: 'rail', station: { id: '33605', name: 'Warszawa Zachodnia', kind: 'rail' } },
      { kind: 'stop', city: 'warszawa', stop: { id: '1001', name: 'Centrum', kind: 'transit', mode: 'bus' } },
      { kind: 'line', city: 'warszawa', line: { routeId: 'L-1', line: 'L-1', longName: 'A - B', mode: 'bus', kind: 'local' } },
    ] as DiscoveryResult[]
    const user = userEvent.setup()
    render(<Page />)
    await user.click(await screen.findByRole('button', { name: 'wynik 0' }))
    expect(push).toHaveBeenLastCalledWith('/station/33605?name=Warszawa%20Zachodnia', NAV_FORWARD_OPTIONS)
    await user.click(screen.getByRole('button', { name: 'wynik 1' }))
    expect(push).toHaveBeenLastCalledWith('/city/warszawa/stop/1001?name=Centrum', NAV_FORWARD_OPTIONS)
    await user.click(screen.getByRole('button', { name: 'wynik 2' }))
    expect(push).toHaveBeenLastCalledWith('/city/warszawa/line/L-1', NAV_FORWARD_OPTIONS)
  })

  it('a result whose id fails validation does nothing', async () => {
    results = [{ kind: 'rail', station: { id: '../x', name: 'Zła', kind: 'rail' } }] as DiscoveryResult[]
    const user = userEvent.setup()
    render(<Page />)
    await user.click(await screen.findByRole('button', { name: 'wynik 0' }))
    expect(push).not.toHaveBeenCalled()
  })
})
