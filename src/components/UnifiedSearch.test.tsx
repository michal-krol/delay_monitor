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
import { PanelFrame } from './map/PanelFrame'
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

  it('zero results while a source still loads says Wczytywanie…, not Brak wyników', () => {
    found([], { transit: 'loading' })
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="zzz" />)
    expect(statusText()).toContain('Wczytywanie…')
    expect(statusText()).not.toContain('Szukam')
    expect(statusText()).not.toContain('Brak wyników')
  })

  it('1–2 chars shows the 3-character hint and still lists lines', () => {
    found([line('128', '128', 'Pl. Piłsudskiego – Szczęśliwice')], { rail: 'idle', transit: 'idle' })
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="12" />)
    expect(statusText()).toContain('Wpisz co najmniej 3 znaki, aby znaleźć miejsca')
    expect(screen.getByRole('heading', { name: 'Linie' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Linia 128/ })).toBeInTheDocument()
  })

  it('1–2 chars with no line match says Brak linii (places were not searched), never Brak wyników', () => {
    found([], { rail: 'idle', transit: 'idle' })
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="zz" />)
    expect(statusText()).toContain('Wpisz co najmniej 3 znaki, aby znaleźć miejsca')
    expect(statusText()).toContain('Brak linii dla tej frazy')
    expect(statusText()).not.toContain('Brak wyników')
  })

  it('1–2 chars while lines still load says neither Brak linii nor Brak wyników', () => {
    found([], { rail: 'idle', transit: 'idle', lines: 'loading' })
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="zz" />)
    expect(statusText()).not.toContain('Brak linii')
    expect(statusText()).not.toContain('Brak wyników')
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

  it('shows a cap hint when a group is full (worded for "up to", since 8 rows may be exact)', () => {
    found(Array.from({ length: 8 }, (_, index) => rail(String(10000 + index), `Stacja ${index}`)))
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="sta" />)
    expect(screen.getByText('Pokazano do 8 wyników — doprecyzuj frazę')).toBeInTheDocument()
  })

  describe('without a city', () => {
    const noCity = { transit: 'disabled', lines: 'disabled' } as const

    it('cities still loading: says Wczytywanie miast…, keeps PKP results, never asks to pick a city', () => {
      vi.mocked(useCities).mockReturnValue({ state: 'loading', cities: [], retry: vi.fn() })
      found([rail('33605', 'Warszawa Centralna')], noCity)
      render(<UnifiedSearch city={null} onSelect={vi.fn()} initialQuery="cen" />)
      expect(statusText()).toContain('Wczytywanie miast…')
      expect(statusText()).not.toContain('Wybierz miasto')
      expect(screen.getByRole('button', { name: /^Warszawa Centralna/ })).toBeInTheDocument()
    })

    it('cities failed: error tone message and one Spróbuj ponownie that retries the city list and moves focus to the field', async () => {
      const retryCities = vi.fn()
      vi.mocked(useCities).mockReturnValue({ state: 'failed', cities: [], retry: retryCities })
      const retry = found([rail('33605', 'Warszawa Centralna')], noCity)
      const user = userEvent.setup()
      render(<UnifiedSearch city={null} onSelect={vi.fn()} initialQuery="cen" />)
      expect(screen.getByText('Nie udało się wczytać listy miast')).toHaveClass('text-error-text')
      expect(screen.getByRole('button', { name: /^Warszawa Centralna/ })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
      expect(retryCities).toHaveBeenCalledTimes(1)
      expect(retry).not.toHaveBeenCalled()
      expect(screen.getByRole('searchbox')).toHaveFocus()
    })

    it('cities failed and a place source failed: one button retries both', async () => {
      const retryCities = vi.fn()
      vi.mocked(useCities).mockReturnValue({ state: 'failed', cities: [], retry: retryCities })
      const retry = found([], { rail: 'failed', ...noCity })
      const user = userEvent.setup()
      render(<UnifiedSearch city={null} onSelect={vi.fn()} initialQuery="cen" />)
      const buttons = screen.getAllByRole('button', { name: 'Spróbuj ponownie' })
      expect(buttons).toHaveLength(1)
      await user.click(buttons[0])
      expect(retryCities).toHaveBeenCalledTimes(1)
      expect(retry).toHaveBeenCalledTimes(1)
    })

    it('empty registry: says Brak skonfigurowanych miast, no retry button', () => {
      vi.mocked(useCities).mockReturnValue({ state: 'ready', cities: [], retry: vi.fn() })
      found([rail('33605', 'Warszawa Centralna')], noCity)
      render(<UnifiedSearch city={null} onSelect={vi.fn()} initialQuery="cen" />)
      expect(statusText()).toContain('Brak skonfigurowanych miast')
      expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).toBeNull()
      expect(screen.getByRole('button', { name: /^Warszawa Centralna/ })).toBeInTheDocument()
    })

    it('says nothing about cities when only rail is offered or the field is empty', () => {
      vi.mocked(useCities).mockReturnValue({ state: 'failed', cities: [], retry: vi.fn() })
      found([rail('33605', 'Warszawa Centralna')], noCity)
      const { unmount } = render(<UnifiedSearch city={null} onSelect={vi.fn()} initialQuery="cen" kinds={['rail']} />)
      expect(statusText()).not.toContain('miast')
      unmount()
      render(<UnifiedSearch city={null} onSelect={vi.fn()} />)
      expect(statusText()).toBe('')
    })
  })

  it('after a successful retry the focus is on the field, not lost with the unmounted button', async () => {
    found([], { transit: 'failed' })
    const user = userEvent.setup()
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)
    const button = screen.getByRole('button', { name: 'Spróbuj ponownie' })
    await user.click(button)
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('row and Wyczyść focus indicators use outline (survives forced-colors), not box-shadow rings', () => {
    found([rail('33605', 'Warszawa Centralna')])
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} initialQuery="cen" />)
    for (const element of [screen.getByRole('button', { name: /^Warszawa Centralna/ }), screen.getByRole('button', { name: 'Wyczyść' })]) {
      expect(element).toHaveClass('focus-visible:outline-2', 'focus-visible:outline-primary-text')
      expect(element).not.toHaveClass('outline-none')
      expect(element.className).not.toContain('ring-')
    }
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
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(() =>
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

describe('UnifiedSearch variant="overlay" (map)', () => {
  const overlay = (props: Partial<React.ComponentProps<typeof UnifiedSearch>> = {}) =>
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} variant="overlay" {...props} />)

  it('overlay variant renders nothing below the field when query is empty', async () => {
    window.localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '1', name: 'Stacja 1' }]))
    found([rail('33605', 'Warszawa Centralna')])
    overlay()
    expect(screen.getByRole('searchbox', { name: 'Stacja, przystanek lub linia' })).toBeInTheDocument()
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('button', { name: /Warszawa Centralna|Wyczyść/ })).toBeNull()
    expect(screen.queryByText(/Wpisz nazwę/)).toBeNull()
    expect(statusText()).toBe('')
    expect(screen.queryByRole('group', { name: 'Wyniki wyszukiwania' })).toBeNull()
  })

  it('renders the results in an opaque, scrollable panel over the map only while the query is non-empty', async () => {
    found([rail('33605', 'Warszawa Centralna')])
    const user = userEvent.setup()
    overlay()
    await user.type(screen.getByRole('searchbox'), 'cent')
    const panel = screen.getByRole('group', { name: 'Wyniki wyszukiwania' })
    expect(within(panel).getByRole('button', { name: /Warszawa Centralna/ })).toBeInTheDocument()
    expect(panel.className).toMatch(/\babsolute\b/)
    expect(panel.className).toMatch(/overflow-y-auto/)
    expect(panel.className).toMatch(/--sheet-surface/)
  })

  it('Escape clears a non-empty query and closes the panel', async () => {
    found([rail('33605', 'Warszawa Centralna')])
    const onQueryChange = vi.fn()
    const user = userEvent.setup()
    overlay({ onQueryChange })
    await user.type(screen.getByRole('searchbox'), 'cent')
    await user.keyboard('{Escape}')
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(onQueryChange).toHaveBeenLastCalledWith('')
    expect(screen.queryByRole('group', { name: 'Wyniki wyszukiwania' })).toBeNull()
  })

  it('Escape with a query is consumed (an enclosing PanelFrame stays open); with an empty query it passes through', async () => {
    found([rail('33605', 'Warszawa Centralna')])
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <PanelFrame title="A" closeLabel="Zamknij" onClose={onClose}>
        <UnifiedSearch city="warszawa" onSelect={vi.fn()} variant="overlay" />
      </PanelFrame>,
    )
    await user.type(screen.getByRole('searchbox'), 'cent')
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Escape on a focused result row closes the panel, returns focus to the field and does not close an enclosing PanelFrame', async () => {
    found([rail('33605', 'Warszawa Centralna')])
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <PanelFrame title="A" closeLabel="Zamknij" onClose={onClose}>
        <UnifiedSearch city="warszawa" onSelect={vi.fn()} variant="overlay" />
      </PanelFrame>,
    )
    await user.type(screen.getByRole('searchbox'), 'cent')
    const row = screen.getByRole('button', { name: /Warszawa Centralna/ })
    row.focus()
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Wyniki wyszukiwania' })).toBeNull()
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('the field keeps a forced-colors focus indicator: a transparent outline next to the ring (the ring is removed there)', () => {
    overlay()
    expect(screen.getByRole('searchbox')).toHaveClass('focus:outline-2', 'focus:outline-transparent')
  })

  it('the overlay field has its own opaque surface (map labels must not bleed through), the page variant stays glass', () => {
    const { unmount } = overlay()
    const field = screen.getByRole('searchbox')
    expect(field.className).toMatch(/--sheet-surface/)
    expect(field.className).not.toMatch(/\bglass\b/)
    unmount()
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} />)
    expect(screen.getByRole('searchbox').className).toMatch(/\bglass\b/)
  })

  it('the clear button closes the panel', async () => {
    found([rail('33605', 'Warszawa Centralna')])
    const user = userEvent.setup()
    overlay()
    await user.type(screen.getByRole('searchbox'), 'cent')
    await user.click(screen.getByRole('button', { name: 'Wyczyść' }))
    expect(screen.queryByRole('group', { name: 'Wyniki wyszukiwania' })).toBeNull()
  })

  it('picking a result calls onSelect and closes the panel', async () => {
    const result = rail('33605', 'Warszawa Centralna')
    found([result])
    const onSelect = vi.fn()
    const user = userEvent.setup()
    overlay({ onSelect })
    await user.type(screen.getByRole('searchbox'), 'cent')
    await user.click(screen.getByRole('button', { name: /Warszawa Centralna/ }))
    expect(onSelect).toHaveBeenCalledWith(result)
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.queryByRole('group', { name: 'Wyniki wyszukiwania' })).toBeNull()
  })

  describe('closing without Escape', () => {
    const panel = () => screen.queryByRole('group', { name: 'Wyniki wyszukiwania' })

    it('closes the panel on a pointer press outside the field and panel (a tap on the map), keeping the phrase', async () => {
      found([rail('33605', 'Warszawa Centralna')])
      const user = userEvent.setup()
      render(
        <>
          <div data-testid="map" />
          <UnifiedSearch city="warszawa" onSelect={vi.fn()} variant="overlay" />
        </>,
      )
      await user.type(screen.getByRole('searchbox'), 'cent')
      expect(panel()).not.toBeNull()
      await user.pointer({ keys: '[MouseLeft]', target: screen.getByTestId('map') })
      expect(panel()).toBeNull()
      expect(screen.getByRole('searchbox')).toHaveValue('cent')
    })

    it('closes the panel when focus leaves the field and the panel (Tab past the last result)', async () => {
      found([rail('33605', 'Warszawa Centralna')])
      const user = userEvent.setup()
      render(
        <>
          <UnifiedSearch city="warszawa" onSelect={vi.fn()} variant="overlay" />
          <button type="button">Dalej</button>
        </>,
      )
      await user.type(screen.getByRole('searchbox'), 'cent')
      await user.tab() // Wyczyść
      await user.tab() // wynik
      expect(panel()).not.toBeNull()
      await user.tab() // poza polem i panelem
      expect(screen.getByRole('button', { name: 'Dalej' })).toHaveFocus()
      expect(panel()).toBeNull()
    })

    it('stays open while the user interacts inside the panel', async () => {
      found([rail('33605', 'Warszawa Centralna')])
      const user = userEvent.setup()
      overlay()
      await user.type(screen.getByRole('searchbox'), 'cent')
      const row = screen.getByRole('button', { name: /Warszawa Centralna/ })
      await user.pointer({ keys: '[MouseLeft>]', target: row })
      expect(panel()).not.toBeNull()
      await user.tab()
      expect(panel()).not.toBeNull()
    })

    it('reopens when the user returns to the field or types again', async () => {
      found([rail('33605', 'Warszawa Centralna')])
      const user = userEvent.setup()
      render(
        <>
          <div data-testid="map" />
          <UnifiedSearch city="warszawa" onSelect={vi.fn()} variant="overlay" />
        </>,
      )
      await user.type(screen.getByRole('searchbox'), 'cent')
      await user.pointer({ keys: '[MouseLeft]', target: screen.getByTestId('map') })
      expect(panel()).toBeNull()
      await user.click(screen.getByRole('searchbox'))
      expect(panel()).not.toBeNull()
      await user.pointer({ keys: '[MouseLeft]', target: screen.getByTestId('map') })
      expect(panel()).toBeNull()
      await user.type(screen.getByRole('searchbox'), 'r')
      expect(panel()).not.toBeNull()
    })
  })

  it('keeps the live region mounted and shows messages in the panel', async () => {
    found([], { transit: 'loading' })
    const user = userEvent.setup()
    overlay()
    expect(screen.getByRole('status')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox'), 'cent')
    expect(statusText()).toContain('Wczytywanie…')
  })

  it('the default (page) variant is unchanged: results stay in flow, Escape keeps the query', async () => {
    found([rail('33605', 'Warszawa Centralna')])
    const user = userEvent.setup()
    render(<UnifiedSearch city="warszawa" onSelect={vi.fn()} />)
    await user.type(screen.getByRole('searchbox'), 'cent')
    await user.keyboard('{Escape}')
    expect(screen.getByRole('searchbox')).toHaveValue('cent')
    expect(screen.queryByRole('group', { name: 'Wyniki wyszukiwania' })).toBeNull()
  })
})
