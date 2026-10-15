// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserLocationProvider } from '@/components/UserLocationProvider'
import { LocateControl } from './LocateControl'

type Success = (p: GeolocationPosition) => void
type Failure = (e: GeolocationPositionError) => void

/** Atrapa `navigator.geolocation`: odpowiedź przychodzi dopiero z testu. */
function stubGeolocation() {
  const calls: { ok: Success; fail: Failure }[] = []
  const getCurrentPosition = vi.fn((ok: Success, fail: Failure) => {
    calls.push({ ok, fail })
  })
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  return { calls, getCurrentPosition }
}

const fix = { coords: { latitude: 52.23, longitude: 21.01, accuracy: 25 } } as GeolocationPosition
const failure = (code: number) => ({ code, message: 'x' }) as GeolocationPositionError

function setup() {
  const onLocated = vi.fn()
  render(
    <UserLocationProvider>
      <LocateControl onLocated={onLocated} />
    </UserLocationProvider>
  )
  return { onLocated, button: () => screen.getByRole('button', { name: 'Moja lokalizacja' }) }
}

beforeEach(() => {
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
})
afterEach(() => vi.restoreAllMocks())

describe('LocateControl', () => {
  it('asks for the position only after a click and hands the point to the page', async () => {
    const geo = stubGeolocation()
    const { onLocated, button } = setup()
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    expect(button()).toHaveAttribute('aria-busy', 'false')

    fireEvent.click(button())
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(button()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Szukam lokalizacji…')

    await act(async () => geo.calls[0].ok(fix))
    expect(onLocated).toHaveBeenCalledWith({ lat: 52.23, lon: 21.01, accuracyM: 25 })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('denied shows the denial text and does not re-request', async () => {
    const geo = stubGeolocation()
    const { onLocated, button } = setup()
    fireEvent.click(button())
    await act(async () => geo.calls[0].fail(failure(1)))
    expect(screen.getByRole('status')).toHaveTextContent('Brak dostępu do lokalizacji. Wyszukaj miejsce lub wybierz je na mapie')
    expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).toBeNull()

    fireEvent.click(button())
    await Promise.resolve()
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(onLocated).not.toHaveBeenCalled()
  })

  it('unavailable explains that the browser has no location', async () => {
    const { button } = setup()
    fireEvent.click(button())
    expect(await screen.findByText('Lokalizacja nie jest dostępna w tej przeglądarce')).toBeInTheDocument()
  })

  it('error offers retry', async () => {
    const geo = stubGeolocation()
    const { onLocated, button } = setup()
    fireEvent.click(button())
    await act(async () => geo.calls[0].fail(failure(3)))
    expect(screen.getByRole('status')).toHaveTextContent('Nie udało się ustalić lokalizacji')

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(2)
    await act(async () => geo.calls[1].ok(fix))
    expect(onLocated).toHaveBeenCalledTimes(1)
  })
})
