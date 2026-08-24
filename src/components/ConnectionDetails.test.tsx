// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
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
      hasTrainStarted: false,
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
      // Poprzedni przystanek (Gdańsk) jest już potwierdzony -- pociąg jest w
      // trasie, tylko jeszcze nie dotarł do Warszawy.
      hasTrainStarted: true,
    },
  ],
}

describe('ConnectionDetails', () => {
  it('shows a loading state, then the full stop list once data arrives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

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

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await screen.findByText('Gdańsk Główny')

    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    expect(url.pathname).toBe('/api/train')
    expect(url.searchParams.get('scheduleId')).toBe('2026')
    expect(url.searchParams.get('orderId')).toBe('12345')
    expect(url.searchParams.get('operatingDate')).toBe('2026-08-01')
  })

  it('shows the en-route delay estimate for an unconfirmed stop, the same as the board would for the same stop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        jsonResponse({
          ...RESPONSE,
          stops: [
            { ...RESPONSE.stops[0], estimatedDelayMinutes: null },
            { ...RESPONSE.stops[1], estimatedDelayMinutes: 6 },
          ],
        })
      )
    )

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    expect(await screen.findByText('w trasie, ~+6 min')).toBeInTheDocument()
  })

  it('falls back to the board row label while the route name is not yet known', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    expect(screen.getByRole('heading', { name: 'EIC 1' })).toBeInTheDocument()
  })

  it('shows an error message when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się pobrać szczegółów połączenia.')
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

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    expect(await screen.findByText('brak danych')).toBeInTheDocument()
    expect(screen.queryByText('punktualnie')).not.toBeInTheDocument()
  })

  it('shows the total number of stops', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    expect(await screen.findByText('2 przystanków')).toBeInTheDocument()
  })

  it('renders "w trasie" for an unconfirmed stop once an earlier stop is already confirmed', async () => {
    // Fixture RESPONSE ma to od początku (Gdańsk potwierdzony, Warszawa
    // Centralna jeszcze nie) -- pociąg już wyjechał z Gdańska, więc Warszawa
    // powinna dostać "w trasie", nie mylące "jeszcze nie wyjechał".
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    const stationName = await screen.findByText('Warszawa Centralna')
    // eslint-disable-next-line testing-library/no-node-access -- najbliższy <li> to cały wiersz przystanku, potrzebny żeby ograniczyć zapytanie do TEGO przystanku
    const row = stationName.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('w trasie')).toBeInTheDocument()
    expect(within(row as HTMLElement).queryByText('punktualnie')).not.toBeInTheDocument()
    expect(within(row as HTMLElement).queryByText('jeszcze nie wyjechał')).not.toBeInTheDocument()
  })

  it('renders "jeszcze nie wyjechał" when the whole train has not left any stop yet', async () => {
    const response = {
      ...RESPONSE,
      stops: [
        { ...RESPONSE.stops[0], isConfirmed: false, actualDeparture: null, departureDelayMinutes: null, hasTrainStarted: false },
        { ...RESPONSE.stops[1], hasTrainStarted: false },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    const stationName = await screen.findByText('Warszawa Centralna')
    // eslint-disable-next-line testing-library/no-node-access -- j.w., ograniczenie zapytania do wiersza tego przystanku
    const row = stationName.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('jeszcze nie wyjechał')).toBeInTheDocument()
    expect(within(row as HTMLElement).queryByText('w trasie')).not.toBeInTheDocument()
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

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    const stationName = await screen.findByText('Gdańsk Główny')
    // eslint-disable-next-line testing-library/no-node-access -- j.w., ograniczenie zapytania do wiersza tego przystanku
    const row = stationName.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('odwołany')).toBeInTheDocument()
  })

  it('shows an explicit "niedostępne" for fields the API does not provide, never a fabricated value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await screen.findByText('Gdańsk Główny')

    const unavailable = screen.getAllByText('niedostępne')
    expect(unavailable).toHaveLength(3) // Tabor, Prędkość, Długość składu
    unavailable.forEach((el) => expect(el).toHaveAttribute('title', 'Niedostępne w danych PKP'))
  })
})
