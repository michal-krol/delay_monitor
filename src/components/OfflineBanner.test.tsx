// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflineBanner, offlineMessage } from './OfflineBanner'

afterEach(() => vi.useRealTimers())

describe('offlineMessage', () => {
  it('bez znanego sukcesu mówi tylko o braku połączenia', () => {
    expect(offlineMessage(null, 1_000_000)).toBe('Brak połączenia z internetem')
  })

  it('wiek poniżej minuty zaokrągla do 1 min', () => {
    expect(offlineMessage(1_000_000 - 30_000, 1_000_000)).toBe('Brak połączenia — dane sprzed 1 min')
  })

  it('podaje wiek danych w minutach', () => {
    expect(offlineMessage(1_000_000 - 5 * 60_000, 1_000_000)).toBe('Brak połączenia — dane sprzed 5 min')
  })
})

describe('OfflineBanner', () => {
  it('region status jest zawsze w DOM (pusty online), treść pojawia się po zdarzeniu offline i znika po online', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    render(<OfflineBanner />)
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()

    act(() => {
      onLine.mockReturnValue(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent('Brak połączenia')

    act(() => {
      onLine.mockReturnValue(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(status).toBeEmptyDOMElement()
    onLine.mockRestore()
  })
})
