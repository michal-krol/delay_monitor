// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCities } from '@/hooks/useCities'
import { useOnline } from '@/hooks/useOnline'
import { useUnifiedSearch, type SearchSourceState } from '@/hooks/useUnifiedSearch'
import type { CityLinesState } from '@/hooks/useCityLines'
import type { DiscoveryResult } from '@/lib/discovery'
import type { LineListEntry } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'
import { jsonResponse } from '@/test-utils/http'
import { MODE_ICON } from './transitMode'
import { UnifiedSearch } from './UnifiedSearch'

vi.mock('@/hooks/useUnifiedSearch', () => ({ useUnifiedSearch: vi.fn() }))
vi.mock('@/hooks/useCities', () => ({ useCities: vi.fn() }))
vi.mock('@/hooks/useOnline', () => ({ useOnline: vi.fn() }))

const mockSearch = vi.mocked(useUnifiedSearch)

const rail = (id: string, name: string): DiscoveryResult => ({ kind: 'rail', station: { id, name, kind: 'rail', mode: 'rail' } })
const stop = (id: string, name: string, modes: GtfsMode[] = ['bus'], lines: string[] = ['128']): DiscoveryResult => ({
  kind: 'stop',
  city: 'warszawa',
  stop: {
    id,
    name,
    kind: 'transit',
    mode: modes[0],
    modes,
    lines: lines.map((line) => ({ routeId: line, line, mode: modes[0], kind: 'regular' as const })),
  },
})
const line = (routeId: string, number: string, longName: string, mode: GtfsMode = 'bus'): DiscoveryResult => ({
  kind: 'line',
  city: 'warszawa',
  line: { routeId, line: number, longName, mode, kind: 'regular' } satisfies LineListEntry,
})

type Sources = Record<'rail' | 'transit' | 'lines', SearchSourceState>
function found(results: DiscoveryResult[], sources: Partial<Sources> = {}, retry = vi.fn()) {
  mockSearch.mockReturnValue({ results, sources: { rail: 'ready', transit: 'ready', lines: 'ready', ...sources }, retry })
  return retry
}

const statusText = () => screen.getByRole('status').textContent
/** Wnętrze `<svg>` ikony trybu — rozróżnia piktogramy (komponenty ikon nie mają innego znacznika). */
const iconInner = (mode: GtfsMode) => renderToStaticMarkup(createElement(MODE_ICON[mode], {})).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

beforeEach(() => {
  window.localStorage.clear()
  mockSearch.mockReset()
  found([])
  vi.mocked(useCities).mockReturnValue({ state: 'ready', cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [] }], retry: vi.fn() })
  vi.mocked(useOnline).mockReturnValue(true)
})

describe('UnifiedSearch', () => {
  it('groups results by kind with headings', () => {
    found([rail('33605', 'Warszawa Centralna'), stop('1001', 'Centrum'), line('128', '128', 'Pl. Piłsudskiego – Szczęśliwice')])
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)
    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['Stacje kolejowe', 'Przystanki', 'Linie'])
    const railGroup = screen.getByRole('region', { name: 'Stacje kolejowe' })
    expect(within(railGroup).getByText('Warszawa Centralna')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Linie' })).queryByText('Warszawa Centralna')).toBeNull()
    expect(screen.getByRole('searchbox', { name: 'Stacja, przystanek lub linia' })).toBeInTheDocument()
  })

  it('enter in the field does not pick the first result', async () => {
    found([rail('33605', 'Warszawa Centralna')])
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<UnifiedSearch city="warszawa" onSelect={onSelect} autoFocus />)
    const input = screen.getByRole('searchbox')
    await user.type(input, 'cent{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
    expect(input).not.toHaveFocus()
  })

  it('tab order walks the results', async () => {
    found([rail('33605', 'Warszawa Centralna'), stop('1001', 'Centrum')])
    const user = userEvent.setup()
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)
    screen.getByRole('searchbox').focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Wyczyść' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: /^Warszawa Centralna/ })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: /^Centrum/ })).toHaveFocus()
  })

  it('row click calls onSelect with the DiscoveryResult', async () => {
    const result = stop('1001', 'Centrum')
    found([result])
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<UnifiedSearch city="warszawa" onSelect={onSelect} initialQuery="cen" />)
    await user.click(screen.getByRole('button', { name: /^Centrum/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(result)
  })

  it('partial failure never says Brak wyników', () => {
    found([line('128', '128', 'Pl. Piłsudskiego – Szczęśliwice')], { rail: 'failed' })
    const { rerender } = render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)
    expect(screen.queryByText(/Brak wyników/)).toBeNull()
    expect(screen.getByText('Nie udało się wczytać stacji kolejowych')).toBeInTheDocument()
    // Źródło zawiodło i nic nie znaleziono: nadal „nie wiemy”, nie „nie ma”.
    found([], { rail: 'failed' })
    rerender(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)
    expect(screen.queryByText(/Brak wyników/)).toBeNull()
  })

  it('zero results with healthy sources says Brak wyników', () => {
    found([])
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="zzz" />)
    expect(statusText()).toContain('Brak wyników dla tej frazy')
  })

  it('zero results while a source still loads says Szukam…, not Brak wyników', () => {
    found([], { transit: 'loading' })
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="zzz" />)
    expect(statusText()).toContain('Szukam…')
    expect(statusText()).not.toContain('Brak wyników')
  })

  it('1–2 chars shows the 3-character hint and still lists lines', () => {
    found([line('128', '128', 'Pl. Piłsudskiego – Szczęśliwice')], { rail: 'idle', transit: 'idle' })
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="12" />)
    expect(statusText()).toContain('Wpisz co najmniej 3 znaki, aby znaleźć miejsca')
    expect(screen.getByRole('heading', { name: 'Linie' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Linia 128/ })).toBeInTheDocument()
  })

  it('failed source shows Nie udało się wczytać … and Spróbuj ponownie calls retry', async () => {
    const retry = found([], { transit: 'failed', lines: 'failed' })
    const user = userEvent.setup()
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)
    expect(screen.getByText('Nie udało się wczytać przystanków')).toBeInTheDocument()
    expect(screen.getByText('Nie udało się wczytać linii')).toBeInTheDocument()
    expect(screen.queryByText(/Błąd/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("clear button empties, calls onQueryChange('') and refocuses", async () => {
    const onQueryChange = vi.fn()
    const user = userEvent.setup()
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" onQueryChange={onQueryChange} />)
    const input = screen.getByRole('searchbox')
    expect(input).toHaveValue('cen')
    await user.click(screen.getByRole('button', { name: 'Wyczyść' }))
    expect(input).toHaveValue('')
    expect(onQueryChange).toHaveBeenLastCalledWith('')
    expect(input).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Wyczyść' })).toBeNull()
  })

  it('initialQuery change syncs without calling onQueryChange', () => {
    const onQueryChange = vi.fn()
    const { rerender } = render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="a" onQueryChange={onQueryChange} />)
    rerender(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="xyz" onQueryChange={onQueryChange} />)
    expect(screen.getByRole('searchbox')).toHaveValue('xyz')
    expect(onQueryChange).not.toHaveBeenCalled()
  })

  it('initialQuery that echoes our own typing is not re-synced, but a different one (Back) is', async () => {
    const onQueryChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="" onQueryChange={onQueryChange} />)
    const input = screen.getByRole('searchbox')
    await user.type(input, 'ce')
    // Rodzic odbija pierwszą literę z opóźnieniem — pole nie może się cofnąć do „c”.
    rerender(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="c" onQueryChange={onQueryChange} />)
    expect(input).toHaveValue('ce')
    // Wstecz: adres, którego nie wpisaliśmy.
    rerender(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="pla" onQueryChange={onQueryChange} />)
    expect(input).toHaveValue('pla')
    expect(onQueryChange).toHaveBeenCalledTimes(2)
  })

  it('typing calls onQueryChange per change', async () => {
    const onQueryChange = vi.fn()
    const user = userEvent.setup()
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} onQueryChange={onQueryChange} />)
    await user.type(screen.getByRole('searchbox'), 'abc')
    expect(onQueryChange.mock.calls.map((call) => call[0])).toEqual(['a', 'ab', 'abc'])
  })

  it("kinds=['rail','stop'] hides the lines group and hides the line source's failure", () => {
    found([rail('33605', 'Warszawa Centralna'), line('128', '128', 'Pl. Piłsudskiego – Szczęśliwice')], { lines: 'failed' })
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" kinds={['rail', 'stop']} />)
    expect(screen.queryByRole('heading', { name: 'Linie' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Linia 128/ })).toBeNull()
    expect(screen.queryByText(/Nie udało się wczytać linii/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Stacje kolejowe' })).toBeInTheDocument()
  })

  it('bus 128, tram 20, metro M1 and rail S2 rows: icon, badge, context; rail GTFS row says Kolej miejska, not PKP', () => {
    found([
      rail('33605', 'Warszawa Centralna'),
      line('128', '128', 'Pl. Piłsudskiego – Szczęśliwice', 'bus'),
      line('20', '20', 'Annopol – Wyścigi', 'tram'),
      line('M1', 'M1', 'Kabaty – Młociny', 'metro'),
      line('S2', 'S2', 'Pruszków – Otwock', 'rail'),
    ])
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)

    const cases: Array<[string, GtfsMode, string]> = [
      ['Linia 128, Pl. Piłsudskiego – Szczęśliwice, Autobus · Warszawa', 'bus', '128'],
      ['Linia 20, Annopol – Wyścigi, Tramwaj · Warszawa', 'tram', '20'],
      ['Linia M1, Kabaty – Młociny, Metro · Warszawa', 'metro', 'M1'],
      ['Linia S2, Pruszków – Otwock, Kolej miejska · Warszawa', 'rail', 'S2'],
    ]
    for (const [name, mode, badge] of cases) {
      const row = screen.getByRole('button', { name })
      expect(row.textContent).toContain(badge)
      expect(row.innerHTML).toContain(iconInner(mode))
    }
    const gtfsRail = screen.getByRole('button', { name: /^Linia S2/ })
    expect(gtfsRail.textContent).toContain('Kolej miejska · Warszawa')
    expect(gtfsRail.textContent).not.toContain('PKP')

    const pkp = screen.getByRole('button', { name: /^Warszawa Centralna/ })
    expect(pkp.textContent).toContain('Stacja kolejowa PKP')
    expect(pkp.innerHTML).toContain(iconInner('rail'))
  })

  it('stop row shows the icon of every mode', () => {
    found([stop('1001', 'Centrum', ['bus', 'tram', 'metro'], ['9', '175', '507', '20', 'M1', 'N16', 'L-1', 'Z1'])])
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)
    const row = screen.getByRole('button', { name: /^Centrum/ })
    for (const mode of ['bus', 'tram', 'metro'] as const) expect(row.innerHTML).toContain(iconInner(mode))
    expect(row.textContent).toContain('Zespół przystanków · Warszawa')
    // Sześć plakietek + „+N” dla reszty.
    expect(row.textContent).toContain('+2')
    expect(row.textContent).not.toContain('L-1')
  })

  it('a stop without a known city name shows no raw id', () => {
    vi.mocked(useCities).mockReturnValue({ state: 'loading', cities: [], retry: vi.fn() })
    found([stop('1001', 'Centrum')])
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)
    const row = screen.getByRole('button', { name: /^Centrum/ })
    expect(row.textContent).toContain('Zespół przystanków')
    expect(row.textContent).not.toContain('warszawa')
    expect(row.textContent).not.toContain('·')
  })

  it('a line without longName shows just the badge and a clean name', () => {
    found([line('128', '128', '')])
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="128" />)
    expect(screen.getByRole('button', { name: 'Linia 128, Autobus · Warszawa' })).toBeInTheDocument()
  })

  it('shows a cap hint when a group is full', () => {
    found(Array.from({ length: 8 }, (_, index) => rail(String(10000 + index), `Stacja ${index}`)))
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="sta" />)
    expect(screen.getByText('Pokazano pierwsze 8 — doprecyzuj frazę')).toBeInTheDocument()
  })

  it('without a city says to pick one but keeps PKP results', () => {
    found([rail('33605', 'Warszawa Centralna')], { transit: 'disabled', lines: 'disabled' })
    render(<UnifiedSearch city={null} onSelect={vi.fn()} initialQuery="cen" />)
    expect(statusText()).toContain('Wybierz miasto, aby szukać przystanków i linii')
    expect(screen.getByRole('button', { name: /^Warszawa Centralna/ })).toBeInTheDocument()
  })

  it('passes city, query and lineSource to the search hook', async () => {
    const lineSource: CityLinesState = { lines: [], state: 'ready', error: false, refresh: vi.fn(), schedule: null, attribution: [] }
    const user = userEvent.setup()
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} lineSource={lineSource} />)
    await user.type(screen.getByRole('searchbox'), 'ab')
    expect(mockSearch).toHaveBeenLastCalledWith({ city: 'warszawa', query: 'ab', lineSource })
  })

  it('empty field shows recents and no status', async () => {
    window.localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '1', name: 'Stacja 1' }]))
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Ostatnio oglądane' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stacja 1' })).toBeInTheDocument()
    expect(statusText()).toBe('')
    expect(screen.queryByText(/Wpisz nazwę/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Wyczyść' })).toBeInTheDocument() // „Wyczyść” listy ostatnich, nie pola
  })

  it('empty field shows recent lines of the city when the line list is available', async () => {
    window.localStorage.setItem('monitor.recentLines.v1', JSON.stringify({ warszawa: ['128'] }))
    const lineSource: CityLinesState = {
      lines: [{ routeId: '128', line: '128', longName: 'Pl. Piłsudskiego – Szczęśliwice', mode: 'bus', kind: 'regular' }],
      state: 'ready',
      error: false,
      refresh: vi.fn(),
      schedule: null,
      attribution: [],
    }
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} lineSource={lineSource} />)
    expect(await screen.findByRole('link', { name: 'Linia 128: Pl. Piłsudskiego – Szczęśliwice' })).toBeInTheDocument()
  })

  it('without lineSource it fetches the line list once and shows recent lines from it', async () => {
    window.localStorage.setItem('monitor.recentLines.v1', JSON.stringify({ warszawa: ['128'] }))
    const fetchMock = vi.fn((_url: string) =>
      jsonResponse({
        city: 'warszawa',
        schedule: { state: 'ready', loadedAt: null, ageMs: null, phase: null, serviceDates: null, feedVersion: null },
        lines: { metro: [], tram: [], rail: [], other: [], bus: [{ routeId: '128', line: '128', longName: 'Szczęśliwice', mode: 'bus', kind: 'regular' }] },
        attribution: [],
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} />)
      expect(await screen.findByRole('link', { name: 'Linia 128: Szczęśliwice' })).toBeInTheDocument()
      expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/gtfs/lines'))).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('empty field without recents shows the instruction; recents={false} hides recents', async () => {
    const { unmount } = render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} />)
    expect(await screen.findByText('Wpisz nazwę stacji, przystanku albo numer linii')).toBeInTheDocument()
    unmount()
    window.localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '1', name: 'Stacja 1' }]))
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} recents={false} />)
    expect(screen.queryByRole('heading', { name: 'Ostatnio oglądane' })).toBeNull()
  })

  it('offline adds the stale note', () => {
    vi.mocked(useOnline).mockReturnValue(false)
    found([rail('33605', 'Warszawa Centralna')])
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)
    expect(statusText()).toContain('Brak połączenia — wyniki mogą być nieaktualne')
  })

  it('offline with an empty field says nothing', () => {
    vi.mocked(useOnline).mockReturnValue(false)
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} />)
    expect(statusText()).toBe('')
  })

  it('rows have accessible names', () => {
    found([rail('33605', 'Warszawa Centralna'), stop('1001', 'Centrum'), line('128', '128', 'Pl. Piłsudskiego – Szczęśliwice')])
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)
    expect(screen.getByRole('button', { name: 'Warszawa Centralna, Stacja kolejowa PKP' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Centrum, Zespół przystanków · Warszawa, linie 128' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Linia 128, Pl. Piłsudskiego – Szczęśliwice, Autobus · Warszawa' })).toBeInTheDocument()
    expect(screen.queryByRole('option')).toBeNull()
  })
})
