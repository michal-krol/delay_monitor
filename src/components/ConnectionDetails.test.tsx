// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionDetails } from './ConnectionDetails'
import { jsonResponse } from '@/test-utils/http'

afterEach(() => {
  vi.unstubAllGlobals()
})

const RESPONSE = {
  scheduleId: '2026',
  orderId: '12345',
  operatingDate: '2026-08-01',
  trainStatus: 'P',
  carrierCode: 'IC',
  category: 'EIC',
  routeName: 'EIC Grunwald',
  stops: [
    {
      stationId: '7500',
      stationName: 'Gdańsk Główny',
      plannedArrival: null,
      actualArrival: null,
      arrivalDelayMinutes: null,
      plannedDeparture: '2026-08-01T09:00:00.000Z',
      actualDeparture: '2026-08-01T09:07:00.000Z',
      departureDelayMinutes: 7,
      isCancelled: false,
      isConfirmed: true,
      platform: '3/1',
    },
    {
      stationId: '33605',
      stationName: 'Warszawa Centralna',
      plannedArrival: '2026-08-01T11:20:00.000Z',
      actualArrival: null,
      arrivalDelayMinutes: null,
      plannedDeparture: null,
      actualDeparture: null,
      departureDelayMinutes: null,
      isCancelled: false,
      isConfirmed: false,
      platform: null,
    },
  ],
}

describe('ConnectionDetails', () => {
  it('shows a loading state, then the full stop list once data arrives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={vi.fn()} />
    )

    expect(screen.getByText('Wczytywanie trasy…')).toBeInTheDocument()

    expect(await screen.findByText('Gdańsk Główny')).toBeInTheDocument()
    expect(screen.getByText('Warszawa Centralna')).toBeInTheDocument()
    expect(screen.getByText('EIC Grunwald')).toBeInTheDocument()
    expect(screen.getByText('+7 min')).toBeInTheDocument()
    expect(screen.getByText('Peron/tor 3/1')).toBeInTheDocument()
  })

  it('requests the exact scheduleId/orderId/operatingDate it was given', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(RESPONSE))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={vi.fn()} />
    )
    await screen.findByText('Gdańsk Główny')

    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    expect(url.pathname).toBe('/api/train')
    expect(url.searchParams.get('scheduleId')).toBe('2026')
    expect(url.searchParams.get('orderId')).toBe('12345')
    expect(url.searchParams.get('operatingDate')).toBe('2026-08-01')
  })

  it('falls back to the board row label while the route name is not yet known', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})))

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={vi.fn()} />
    )

    expect(screen.getByRole('heading', { name: 'EIC 1' })).toBeInTheDocument()
  })

  it('shows an error message when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={vi.fn()} />
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się pobrać szczegółów połączenia.')
  })

  it('calls onClose when the close button is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={onClose} />
    )
    await screen.findByText('Gdańsk Główny')
    await user.click(screen.getByRole('button', { name: 'Zamknij' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking the backdrop outside the panel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={onClose} />
    )
    await screen.findByText('Gdańsk Główny')
    await user.click(screen.getByTestId('connection-details-backdrop'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={onClose} />
    )
    await screen.findByText('Gdańsk Główny')
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows "brak danych" (not a false "punktualnie") for a confirmed stop whose delay could not be determined', async () => {
    // Przystanek bez dopasowanej trasy/planu ma oba pola opóźnienia `null` —
    // to nie to samo co opóźnienie 0. Pokazanie zielonego "punktualnie" byłoby
    // fałszywą informacją.
    const response = {
      ...RESPONSE,
      stops: [
        {
          stationId: '9999',
          stationName: 'Stacja bez trasy',
          plannedArrival: null,
          actualArrival: '2026-08-01T10:00:00.000Z',
          arrivalDelayMinutes: null,
          plannedDeparture: null,
          actualDeparture: '2026-08-01T10:05:00.000Z',
          departureDelayMinutes: null,
          isCancelled: false,
          isConfirmed: true,
          platform: null,
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={vi.fn()} />
    )

    expect(await screen.findByText('brak danych')).toBeInTheDocument()
    expect(screen.queryByText('punktualnie')).not.toBeInTheDocument()
  })

  it('shows the total number of stops', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={vi.fn()} />
    )

    expect(await screen.findByText('2 przystanków')).toBeInTheDocument()
  })

  it('keeps only the stop list scrollable, not the header with the close button, for long routes', async () => {
    const manyStops = Array.from({ length: 35 }, (_, i) => ({
      ...RESPONSE.stops[0],
      stationId: String(i),
      stationName: `Stacja ${i}`,
    }))
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ ...RESPONSE, stops: manyStops })))

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={vi.fn()} />
    )
    await screen.findByText('Stacja 0')

    expect(screen.getByText('35 przystanków')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zamknij' })).toBeVisible()
    // eslint-disable-next-line testing-library/no-node-access -- sprawdzamy konkretnie, że to lista przystanków (a nie panel) ma klasę przewijania
    const list = document.querySelector('ol')
    expect(list).toHaveClass('overflow-y-auto')
  })

  it('does not close when clicking inside the panel itself', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={onClose} />
    )
    await user.click(await screen.findByText('EIC Grunwald'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders "jeszcze nie wyjechał" for the unconfirmed stop, not a false "punktualnie"', async () => {
    // Fixture RESPONSE ma to od początku (Warszawa Centralna, isConfirmed:
    // false) -- ale do teraz nic nie sprawdzało, co się dla niej faktycznie
    // renderuje. To dokładnie ta klasa błędu, którą naprawiliśmy na tablicy.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={vi.fn()} />
    )

    const stationName = await screen.findByText('Warszawa Centralna')
    // eslint-disable-next-line testing-library/no-node-access -- najbliższy <li> to cały wiersz przystanku, potrzebny żeby ograniczyć zapytanie do TEGO przystanku
    const row = stationName.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('jeszcze nie wyjechał')).toBeInTheDocument()
    expect(within(row as HTMLElement).queryByText('punktualnie')).not.toBeInTheDocument()
  })

  it('renders "odwołany" for a cancelled stop', async () => {
    const response = {
      ...RESPONSE,
      stops: [
        { ...RESPONSE.stops[0], isCancelled: true, isConfirmed: false, departureDelayMinutes: null },
        RESPONSE.stops[1],
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

    render(
      <ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" onClose={vi.fn()} />
    )

    const stationName = await screen.findByText('Gdańsk Główny')
    // eslint-disable-next-line testing-library/no-node-access -- j.w., ograniczenie zapytania do wiersza tego przystanku
    const row = stationName.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('odwołany')).toBeInTheDocument()
  })
})
