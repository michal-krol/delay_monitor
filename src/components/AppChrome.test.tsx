// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppChrome } from './AppChrome'
import { __resetCityContext } from '@/hooks/useCityContext'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'
import { stubDialogMethods } from '@/test-utils/dialog'

const usePathname = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => usePathname(),
  useRouter: () => ({ push: vi.fn() }),
}))

let dialog: ReturnType<typeof stubDialogMethods>

beforeEach(() => {
  dialog = stubDialogMethods()
  usePathname.mockReturnValue('/')
  window.localStorage.clear()
  __resetCityContext()
  resetCitiesCacheForTests()
  vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [] }], stations: [] })))
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

const sidebar = () => within(screen.getByRole('complementary'))

describe('AppChrome sidebar', () => {
  it('marks "Pulpit" as the current page only on the root path', () => {
    render(<AppChrome />)
    expect(sidebar().getByRole('link', { name: 'Pulpit' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks nothing as current on a station or connection page', () => {
    usePathname.mockReturnValue('/station/33605')
    render(<AppChrome />)
    expect(sidebar().getByRole('link', { name: 'Pulpit' })).not.toHaveAttribute('aria-current')
  })

  it('marks "Odjazdy / Przyjazdy" on a city page, "Linie" on a line page', () => {
    usePathname.mockReturnValue('/city/warszawa')
    const { rerender } = render(<AppChrome />)
    expect(sidebar().getByRole('link', { name: 'Odjazdy / Przyjazdy' })).toHaveAttribute('aria-current', 'page')

    usePathname.mockReturnValue('/city/warszawa/line/20')
    rerender(<AppChrome />)
    expect(sidebar().getByRole('link', { name: 'Linie' })).toHaveAttribute('aria-current', 'page')
    expect(sidebar().getByRole('link', { name: 'Odjazdy / Przyjazdy' })).not.toHaveAttribute('aria-current')
  })
})

describe('AppChrome search', () => {
  it('renders the mobile header and the bottom navigation', () => {
    render(<AppChrome />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Nawigacja główna' })).toBeInTheDocument()
  })

  it('opens the search dialog on Ctrl+K and prevents the browser default', () => {
    render(<AppChrome />)
    expect(dialog.showModal).not.toHaveBeenCalled()
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    return screen.findByRole('combobox').then(() => expect(dialog.showModal).toHaveBeenCalledTimes(1))
  })

  it('opens on "/" from the page body', async () => {
    render(<AppChrome />)
    fireEvent.keyDown(document.body, { key: '/' })
    expect(await screen.findByRole('combobox')).toBeInTheDocument()
  })

  it('ignores "/" while the focus is in an input', () => {
    render(
      <>
        <input aria-label="inne pole" />
        <AppChrome />
      </>,
    )
    fireEvent.keyDown(screen.getByLabelText('inne pole'), { key: '/' })
    expect(dialog.showModal).not.toHaveBeenCalled()
  })

  it('opens from the header and the sidebar buttons', async () => {
    const user = userEvent.setup()
    render(<AppChrome />)
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Szukaj' }))
    expect(dialog.showModal).toHaveBeenCalledTimes(1)
    act(() => (screen.getByRole('dialog') as HTMLDialogElement).close())
    await user.click(sidebar().getByRole('button', { name: /Szukaj/ }))
    expect(dialog.showModal).toHaveBeenCalledTimes(2)
  })
})
