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
  it('marks "Start" as the current page only on the root path', () => {
    render(<AppChrome />)
    expect(sidebar().getByRole('link', { name: 'Start' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks nothing as current on a station or connection page', () => {
    usePathname.mockReturnValue('/station/33605')
    render(<AppChrome />)
    expect(sidebar().getByRole('link', { name: 'Start' })).not.toHaveAttribute('aria-current')
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

  it('keeps the browser omnibox away: Ctrl+K while the dialog is open is also prevented', async () => {
    render(<AppChrome />)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }))
    await screen.findByRole('combobox')
    const second = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })
    document.dispatchEvent(second)
    expect(second.defaultPrevented).toBe(true)
    expect(dialog.showModal).toHaveBeenCalledTimes(1)
  })

  it('ignores a shortcut during IME composition and one already handled', () => {
    render(<AppChrome />)
    const composing = new KeyboardEvent('keydown', { key: '/', isComposing: true, bubbles: true, cancelable: true })
    document.dispatchEvent(composing)
    expect(composing.defaultPrevented).toBe(false)
    const handled = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
    document.addEventListener('keydown', (e) => e.preventDefault(), { once: true, capture: true })
    document.dispatchEvent(handled)
    expect(dialog.showModal).not.toHaveBeenCalled()
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

  it('opens from the bottom-nav and the sidebar buttons — the same single dialog', async () => {
    const user = userEvent.setup()
    render(<AppChrome />)
    const bottomNav = within(screen.getByRole('navigation', { name: 'Nawigacja główna' }))
    await user.click(bottomNav.getByRole('button', { name: 'Szukaj' }))
    expect(dialog.showModal).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    act(() => (screen.getByRole('dialog') as HTMLDialogElement).close())
    await user.click(sidebar().getByRole('button', { name: /Szukaj/ }))
    expect(dialog.showModal).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('the mobile header has no „Szukaj" button (one search action on a phone), the sidebar has exactly one', () => {
    render(<AppChrome />)
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Szukaj' })).toBeNull()
    expect(sidebar().getAllByRole('button', { name: /Szukaj/ })).toHaveLength(1)
  })

  it('Ctrl+K and „/" open the same dialog the bottom-nav button does', async () => {
    render(<AppChrome />)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }))
    expect(await screen.findAllByRole('dialog')).toHaveLength(1)
    expect(dialog.showModal).toHaveBeenCalledTimes(1)
    act(() => (screen.getByRole('dialog') as HTMLDialogElement).close())
    fireEvent.keyDown(document.body, { key: '/' })
    await screen.findByRole('combobox')
    expect(dialog.showModal).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })
})
