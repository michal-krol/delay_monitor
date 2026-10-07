// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INSTALL_DISMISSED_KEY } from '@/lib/installHint'
import { InstallPrompt } from './InstallPrompt'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

function mockEnv({ standalone = false, ua = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130', platform = 'Linux x86_64', touch = 0 } = {}) {
  // jsdom nie definiuje `matchMedia` — podstawiamy własne (sprzątane w `afterEach`).
  window.matchMedia = ((query: string) => ({ matches: standalone && query.includes('standalone'), media: query }) as MediaQueryList) as typeof window.matchMedia
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true }) // jsdom go nie ma
}

function fireBeforeInstallPrompt() {
  const prompt = vi.fn().mockResolvedValue(undefined)
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt })
  act(() => void window.dispatchEvent(event))
  return { event, prompt }
}

beforeEach(() => {
  window.localStorage.clear()
  pathname = '/'
})
afterEach(() => {
  vi.restoreAllMocks()
  // @ts-expect-error przywracamy brak `matchMedia` z jsdom
  delete window.matchMedia
})

describe('InstallPrompt', () => {
  it('renders nothing (only the empty status region) until the browser offers installation', () => {
    mockEnv()
    render(<InstallPrompt />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('Chromium: shows the button on beforeinstallprompt, calls prompt() on click and never shows again', async () => {
    mockEnv()
    render(<InstallPrompt />)
    const { event, prompt } = fireBeforeInstallPrompt()
    expect(event.defaultPrevented).toBe(true)
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Zainstaluj aplikację' })))
    expect(prompt).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('install-prompt')).toBeNull()
    expect(window.localStorage.getItem(INSTALL_DISMISSED_KEY)).not.toBeNull()
  })

  it('iOS: shows the share instruction instead of an install button', () => {
    mockEnv({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', touch: 5 })
    render(<InstallPrompt />)
    expect(screen.getByText('Udostępnij → Do ekranu początkowego')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zainstaluj aplikację' })).toBeNull()
  })

  it('close stores the dismissal; a fresh mount shows nothing', () => {
    mockEnv({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', touch: 5 })
    const view = render(<InstallPrompt />)
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij podpowiedź instalacji' }))
    expect(screen.queryByTestId('install-prompt')).toBeNull()
    view.unmount()
    render(<InstallPrompt />)
    expect(screen.queryByTestId('install-prompt')).toBeNull()
  })

  it('already installed (display-mode standalone): never shown', () => {
    mockEnv({ standalone: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', touch: 5 })
    render(<InstallPrompt />)
    fireBeforeInstallPrompt()
    expect(screen.queryByTestId('install-prompt')).toBeNull()
  })

  it('malformed stored value does not hide the prompt nor crash (schema at the boundary)', () => {
    mockEnv()
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, '{"dismissedAt":"x"')
    render(<InstallPrompt />)
    fireBeforeInstallPrompt()
    expect(screen.getByTestId('install-prompt')).toBeInTheDocument()
  })

  it.each(['/map', '/city/warszawa/map'])('stays out of the way on map views (%s): the sheet needs those gestures', (path) => {
    pathname = path
    mockEnv({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', touch: 5 })
    render(<InstallPrompt />)
    expect(screen.queryByTestId('install-prompt')).toBeNull()
  })

  it('appinstalled hides the prompt', () => {
    mockEnv()
    render(<InstallPrompt />)
    fireBeforeInstallPrompt()
    act(() => void window.dispatchEvent(new Event('appinstalled')))
    expect(screen.queryByTestId('install-prompt')).toBeNull()
  })
})
