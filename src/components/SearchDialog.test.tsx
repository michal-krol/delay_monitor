// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSearchCity, SearchDialog } from './SearchDialog'
import { __resetCityContext } from '@/hooks/useCityContext'
import { resetCitiesCacheForTests, type CityEntry } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'
import { stubDialogMethods } from '@/test-utils/dialog'
import { NAV_FORWARD_OPTIONS } from '@/lib/navTransition'

const usePathname = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ usePathname: () => usePathname(), useRouter: () => ({ push }) }))

const station = (id: string): CityEntry['railStations'][number] => ({ id, name: `S${id}` })
const WARSZAWA: CityEntry = { id: 'warszawa', name: 'Warszawa', railStations: [station('1'), station('2'), station('3')] }
const KRAKOW: CityEntry = { id: 'krakow', name: 'Kraków', railStations: [station('1')] }

describe('resolveSearchCity', () => {
  it('prefers the city from the path over the remembered one', () => {
    expect(resolveSearchCity('/city/krakow/lines', 'warszawa', [WARSZAWA])).toBe('krakow')
    expect(resolveSearchCity('/city/krakow', 'warszawa', null)).toBe('krakow')
  })

  it('uses the remembered city off the /city routes', () => {
    expect(resolveSearchCity('/station/33605', 'krakow', [WARSZAWA])).toBe('krakow')
    expect(resolveSearchCity('/city', 'krakow', [WARSZAWA])).toBe('krakow')
  })

  it('falls back to the city with the most rail stations', () => {
    expect(resolveSearchCity('/', null, [KRAKOW, WARSZAWA])).toBe('warszawa')
  })

  it('ignores a path city segment that fails CITY_ID_PATTERN', () => {
    expect(resolveSearchCity('/city/WAW!/x', 'krakow', [WARSZAWA])).toBe('krakow')
    expect(resolveSearchCity('/city/WAW!/x', null, [WARSZAWA])).toBe('warszawa')
  })

  it('returns null when nothing is known', () => {
    expect(resolveSearchCity('/', null, null)).toBeNull()
    expect(resolveSearchCity('/', null, [])).toBeNull()
  })
})

let dialog: ReturnType<typeof stubDialogMethods>

beforeEach(() => {
  dialog = stubDialogMethods()
  usePathname.mockReturnValue('/')
  window.localStorage.clear()
  __resetCityContext()
  resetCitiesCacheForTests()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const FIELD = { name: /^Stacja, przystanek/ }
const NO_LINES = { city: 'warszawa', schedule: { state: 'ready' }, lines: { metro: [], tram: [], bus: [], rail: [], other: [] }, attribution: [] }
const EMPTY_SEARCH = { stations: [], sources: { rail: 'ready', transit: 'ready' } }
const RAIL = { id: '33605', name: 'Warszawa Zachodnia', kind: 'rail', mode: 'rail' }
const STOP = { id: '1001', name: 'Centrum', kind: 'transit', mode: 'bus' }
const LINE = { routeId: 'L-1', line: 'L-1', longName: 'Centrum - Dworzec', mode: 'bus', kind: 'local' }

/** `/api/cities` → lista (`null` = pada, `'pending'` = nigdy nie odpowiada), `/api/search` i `/api/gtfs/lines` → podane ciała. */
function stubFetch({ search = EMPTY_SEARCH, cities = { cities: [WARSZAWA, KRAKOW] }, lines = NO_LINES }: { search?: unknown; cities?: unknown; lines?: unknown } = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/cities')) {
      if (cities === null) return Promise.reject(new Error('down'))
      return cities === 'pending' ? new Promise<Response>(() => {}) : jsonResponse(cities)
    }
    if (url.startsWith('/api/gtfs/lines')) return jsonResponse(lines)
    return jsonResponse(search)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const withLine = { ...NO_LINES, lines: { ...NO_LINES.lines, bus: [LINE] } }

describe('SearchDialog', () => {
  it('shows the modal and focuses the search input when opened', async () => {
    stubFetch()
    render(<SearchDialog open onClose={vi.fn()} />)
    const input = await screen.findByRole('searchbox', FIELD)
    expect(dialog.showModal).toHaveBeenCalledTimes(1)
    expect(input).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Szukaj stacji, przystanku, linii lub pociągu' })).toBeInTheDocument()
  })

  it('mounts no content while closed', () => {
    stubFetch()
    render(<SearchDialog open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(dialog.showModal).not.toHaveBeenCalled()
  })

  it('closes the native dialog when `open` turns false', () => {
    stubFetch()
    const { rerender } = render(<SearchDialog open onClose={vi.fn()} />)
    rerender(<SearchDialog open={false} onClose={vi.fn()} />)
    expect(dialog.close).toHaveBeenCalled()
  })

  it('searches places of the resolved (default) city', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = stubFetch()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchDialog open onClose={vi.fn()} />)
    await user.type(await screen.findByRole('searchbox'), 'cent')
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/search?q=cent&city=warszawa&rail=all', expect.anything()))
  })

  it('uses the city from the path', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    usePathname.mockReturnValue('/city/krakow/lines')
    const fetchMock = stubFetch()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchDialog open onClose={vi.fn()} />)
    await user.type(await screen.findByRole('searchbox'), 'rynek')
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/search?q=rynek&city=krakow&rail=all', expect.anything()))
  })

  it('dialog works with no city yet (rail results)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = stubFetch({ search: { stations: [RAIL], sources: { rail: 'ready', transit: 'disabled' } }, cities: 'pending' })
    const onClose = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchDialog open onClose={onClose} />)
    await user.type(await screen.findByRole('searchbox'), 'zach')
    await vi.advanceTimersByTimeAsync(300)
    await user.click(await screen.findByRole('button', { name: /^Warszawa Zachodnia/ }))
    expect(fetchMock).toHaveBeenCalledWith('/api/search?q=zach&rail=all', expect.anything())
    expect(push).toHaveBeenCalledWith('/station/33605?name=Warszawa%20Zachodnia', NAV_FORWARD_OPTIONS)
    expect(onClose).toHaveBeenCalled()
  })

  it('stop result pushes /city/{city}/stop/{id} and closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    usePathname.mockReturnValue('/city/warszawa/lines')
    stubFetch({ search: { stations: [STOP], sources: { rail: 'ready', transit: 'ready' } } })
    const onClose = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchDialog open onClose={onClose} />)
    await user.type(await screen.findByRole('searchbox'), 'cent')
    await vi.advanceTimersByTimeAsync(300)
    await user.click(await screen.findByRole('button', { name: /^Centrum, Zespół przystanków/ }))
    expect(push).toHaveBeenCalledWith('/city/warszawa/stop/1001?name=Centrum', NAV_FORWARD_OPTIONS)
    expect(onClose).toHaveBeenCalled()
  })

  it('line result pushes /city/{city}/line/{routeId} and closes', async () => {
    usePathname.mockReturnValue('/city/warszawa/lines')
    stubFetch({ lines: withLine })
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<SearchDialog open onClose={onClose} />)
    await user.type(await screen.findByRole('searchbox'), 'L-1')
    await user.click(await screen.findByRole('button', { name: /^Linia L-1/ }))
    expect(push).toHaveBeenCalledWith('/city/warszawa/line/L-1', NAV_FORWARD_OPTIONS)
    expect(onClose).toHaveBeenCalled()
  })

  it('pushes a rail station to /station and closes after picking it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubFetch({ search: { stations: [RAIL], sources: { rail: 'ready', transit: 'ready' } } })
    const onClose = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchDialog open onClose={onClose} />)
    await user.type(await screen.findByRole('searchbox'), 'zach')
    await vi.advanceTimersByTimeAsync(300)
    await user.click(await screen.findByRole('button', { name: /^Warszawa Zachodnia/ }))
    expect(push).toHaveBeenCalledWith('/station/33605?name=Warszawa%20Zachodnia', NAV_FORWARD_OPTIONS)
    expect(onClose).toHaveBeenCalled()
  })

  it('pick mode: rail and stop go to onPick with the city, no lines group, no recents', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    usePathname.mockReturnValue('/city/warszawa/lines')
    window.localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '1', name: 'Stacja 1' }]))
    stubFetch({ search: {
      stations: [RAIL, STOP], sources: { rail: 'ready', transit: 'ready', trains: 'ready' },
      trains: [{ scheduleId: '10', orderId: '20', operatingDate: '2026-10-21', nationalNumber: '123', name: 'Testowy', origin: null, destination: null }],
    }, lines: withLine })
    const onClose = vi.fn()
    const onPick = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchDialog open onClose={onClose} onPick={onPick} />)
    expect(screen.getByRole('dialog', { name: 'Przypnij do Startu' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ostatnio oglądane' })).not.toBeInTheDocument()
    await user.type(await screen.findByRole('searchbox'), 'cent')
    await vi.advanceTimersByTimeAsync(300)
    const stop = await screen.findByRole('button', { name: /^Centrum, Zespół przystanków/ })
    expect(screen.queryByRole('heading', { name: 'Linie' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Linia / })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pociągi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Testowy/ })).not.toBeInTheDocument()
    await user.click(stop)
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ id: '1001', kind: 'transit' }), 'warszawa')
    await user.click(screen.getByRole('button', { name: /^Warszawa Zachodnia/ }))
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ id: '33605', kind: 'rail' }), 'warszawa')
    expect(push).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows recent places from storage while the query is empty', async () => {
    window.localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '1', name: 'Stacja 1' }]))
    stubFetch()
    render(<SearchDialog open onClose={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Ostatnio oglądane' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stacja 1' })).toBeInTheDocument()
  })

  it('closes after a click on a link inside (recent place), even to the current page', async () => {
    window.localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '1', name: 'Stacja 1' }]))
    stubFetch()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<SearchDialog open onClose={onClose} />)
    await user.click(await screen.findByRole('link', { name: 'Stacja 1' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('moves the focus back to the search input after „Wyczyść" (the focused button unmounts)', async () => {
    window.localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '1', name: 'Stacja 1' }]))
    stubFetch()
    const user = userEvent.setup()
    render(<SearchDialog open onClose={vi.fn()} />)
    const input = await screen.findByRole('searchbox')
    await user.click(await screen.findByRole('button', { name: 'Wyczyść' }))
    expect(screen.queryByRole('button', { name: 'Wyczyść' })).toBeNull()
    expect(input).toHaveFocus()
  })

  it('calls onClose when the native dialog fires `close` (Escape)', async () => {
    stubFetch()
    const onClose = vi.fn()
    render(<SearchDialog open onClose={onClose} />)
    const dialogElement = screen.getByRole('dialog')
    dialogElement.dispatchEvent(new Event('close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape (native `cancel`) calls onClose directly — same close path as InfoSheet, no reliance on `close`', () => {
    stubFetch()
    const onClose = vi.fn()
    render(<SearchDialog open onClose={onClose} />)
    const cancel = new Event('cancel', { cancelable: true })
    screen.getByRole('dialog').dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on a click on the backdrop (the dialog element itself) but not on its content', async () => {
    stubFetch()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<SearchDialog open onClose={onClose} />)
    await user.click(await screen.findByRole('searchbox'))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('has a „Zamknij" button', async () => {
    stubFetch()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<SearchDialog open onClose={onClose} />)
    await user.click(await screen.findByRole('button', { name: 'Zamknij' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the route changes', () => {
    stubFetch()
    const onClose = vi.fn()
    const { rerender } = render(<SearchDialog open onClose={onClose} />)
    expect(onClose).not.toHaveBeenCalled()
    usePathname.mockReturnValue('/map')
    rerender(<SearchDialog open onClose={onClose} />)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
