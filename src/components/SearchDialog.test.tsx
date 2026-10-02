// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSearchCity, SearchDialog } from './SearchDialog'
import { __resetCityContext } from '@/hooks/useCityContext'
import { resetCitiesCacheForTests, type CityEntry } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'
import { stubDialogMethods } from '@/test-utils/dialog'

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

/** `/api/cities` → lista, `/api/search` → wyniki; reszta zapisana do inspekcji. */
function stubFetch(search: unknown = { stations: [] }, cities: unknown = { cities: [WARSZAWA, KRAKOW] }) {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/cities')) return cities === null ? Promise.reject(new Error('down')) : jsonResponse(cities)
    return jsonResponse(search)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('SearchDialog', () => {
  it('shows the modal and focuses the search input when opened', async () => {
    stubFetch()
    render(<SearchDialog open onClose={vi.fn()} />)
    const input = await screen.findByRole('combobox', { name: 'Szukaj stacji lub przystanku…' })
    expect(dialog.showModal).toHaveBeenCalledTimes(1)
    expect(input).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Szukaj stacji lub przystanku' })).toBeInTheDocument()
  })

  it('mounts no content while closed', () => {
    stubFetch()
    render(<SearchDialog open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(dialog.showModal).not.toHaveBeenCalled()
  })

  it('closes the native dialog when `open` turns false', () => {
    stubFetch()
    const { rerender } = render(<SearchDialog open onClose={vi.fn()} />)
    rerender(<SearchDialog open={false} onClose={vi.fn()} />)
    expect(dialog.close).toHaveBeenCalled()
  })

  it('queries all rail stations of the resolved city', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = stubFetch()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchDialog open onClose={vi.fn()} />)
    await user.type(await screen.findByRole('combobox'), 'cent')
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/search?city=warszawa&rail=all&q=cent'))
  })

  it('uses the city from the path', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    usePathname.mockReturnValue('/city/krakow/lines')
    const fetchMock = stubFetch()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchDialog open onClose={vi.fn()} />)
    await user.type(await screen.findByRole('combobox'), 'rynek')
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/search?city=krakow&rail=all&q=rynek'))
  })

  it('says so and offers a retry when the city list failed and no city is known', async () => {
    stubFetch({ stations: [] }, null)
    render(<SearchDialog open onClose={vi.fn()} />)
    expect(await screen.findByText('Nie udało się wczytać listy miast')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('shows a loading hint while the city list is loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<SearchDialog open onClose={vi.fn()} />)
    expect(screen.getByText('Wczytuję…')).toBeInTheDocument()
  })

  it('pushes a transit stop and closes after picking it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubFetch({ stations: [{ id: '1001', name: 'Centrum', kind: 'transit', mode: 'bus' }] })
    const onClose = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchDialog open onClose={onClose} />)
    await user.type(await screen.findByRole('combobox'), 'cent')
    await vi.advanceTimersByTimeAsync(300)
    await user.click(await screen.findByRole('option', { name: 'Centrum' }))
    expect(push).toHaveBeenCalledWith('/city/warszawa/stop/1001?name=Centrum')
    expect(onClose).toHaveBeenCalled()
  })

  it('pushes a rail station to /station and closes after picking it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubFetch({ stations: [{ id: '33605', name: 'Warszawa Zachodnia', kind: 'rail', mode: 'rail' }] })
    const onClose = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchDialog open onClose={onClose} />)
    await user.type(await screen.findByRole('combobox'), 'zach')
    await vi.advanceTimersByTimeAsync(300)
    await user.click(await screen.findByRole('option', { name: 'Warszawa Zachodnia' }))
    expect(push).toHaveBeenCalledWith('/station/33605?name=Warszawa%20Zachodnia')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows recent places from storage while the query is empty', async () => {
    window.localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '1', name: 'Stacja 1' }]))
    stubFetch()
    render(<SearchDialog open onClose={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Ostatnio oglądane' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stacja 1' })).toBeInTheDocument()
  })

  it('moves the focus back to the search input after „Wyczyść" (the focused button unmounts)', async () => {
    window.localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '1', name: 'Stacja 1' }]))
    stubFetch()
    const user = userEvent.setup()
    render(<SearchDialog open onClose={vi.fn()} />)
    const input = await screen.findByRole('combobox')
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

  it('closes on a click on the backdrop (the dialog element itself) but not on its content', async () => {
    stubFetch()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<SearchDialog open onClose={onClose} />)
    await user.click(await screen.findByRole('combobox'))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('dialog'))
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
