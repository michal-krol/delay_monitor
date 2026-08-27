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
  carrierName: '„PKP Intercity” Spółka Akcyjna',
  category: 'EIC',
  categoryName: 'Express InterCity',
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

  it('shows the resolved carrier/category name instead of the raw code, when known', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await screen.findByText('Gdańsk Główny')

    expect(screen.getByText('„PKP Intercity” Spółka Akcyjna')).toBeInTheDocument()
    expect(screen.getByText('Express InterCity')).toBeInTheDocument()
    expect(screen.queryByText('IC')).not.toBeInTheDocument()
  })

  it('falls back to the raw carrier/category code when the name dictionary has no match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ ...RESPONSE, carrierName: null, categoryName: null }))
    )

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await screen.findByText('Gdańsk Główny')

    expect(screen.getByText('IC')).toBeInTheDocument()
    expect(screen.getByText('EIC')).toBeInTheDocument()
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

  it('shows a distinct "brak trasy" message (not the fetch-error alert, not "0 przystanków") when the API returns an empty stop list', async () => {
    // `operation.stations` bywa `null` (legalne wg swaggera) -> schema daje []
    // -> odpowiedź 200 z pustą listą. To nie awaria pobierania (AGENTS.md #7).
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ ...RESPONSE, stops: [] })))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    expect(await screen.findByRole('alert')).toHaveTextContent('PKP nie udostępnia teraz trasy tego połączenia.')
    expect(screen.queryByText('Nie udało się pobrać szczegółów połączenia.')).not.toBeInTheDocument()
    expect(screen.queryByText('0 przystanków')).not.toBeInTheDocument()
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

  it('never shows a raw actual time for an unconfirmed stop, only the planned one -- actual can be a PKP artifact (e.g. off by a whole day)', async () => {
    // Czas o innej porze dnia niż plan, żeby dało się jednoznacznie sprawdzić
    // po tekście, który z dwóch czasów faktycznie trafił na ekran (przykład z
    // audytu -- dokładna wielokrotność doby -- ma tę samą porę dnia co plan,
    // więc sam tekst wyglądałby identycznie niezależnie od tego, czy błąd
    // istnieje; to osobno pokrywają testy `trainDetail.test.ts`).
    const response = {
      ...RESPONSE,
      stops: [
        {
          ...RESPONSE.stops[1],
          isConfirmed: false,
          plannedArrival: '2026-08-01T05:55:00.000Z',
          actualArrival: '2026-08-01T20:15:00.000Z',
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await screen.findByText('Warszawa Centralna')

    const plannedTime = new Date('2026-08-01T05:55:00.000Z').toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    const actualTime = new Date('2026-08-01T20:15:00.000Z').toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    expect(screen.getByText(`Przyjazd ${plannedTime}`)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(actualTime))).not.toBeInTheDocument()
  })

  it('shows a predicted arrival time in italics, with a caveat tooltip, when PKP projects one for an unconfirmed stop', async () => {
    const response = {
      ...RESPONSE,
      stops: [
        {
          ...RESPONSE.stops[1],
          isConfirmed: false,
          plannedArrival: '2026-08-01T21:29:30.000Z',
          predictedArrival: '2026-08-01T22:01:30.000Z',
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await screen.findByText('Warszawa Centralna')

    const predictedTime = new Date('2026-08-01T22:01:30.000Z').toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    const predictedLabel = screen.getByText(`(przewidywany: ${predictedTime})`)
    expect(predictedLabel).toHaveClass('italic')
    expect(predictedLabel).toHaveAttribute('title', expect.stringContaining('Przewidywana godzina'))
  })

  it('shows a predicted departure time in italics, with a caveat tooltip, when PKP projects one for an unconfirmed stop', async () => {
    const response = {
      ...RESPONSE,
      stops: [
        {
          ...RESPONSE.stops[0],
          isConfirmed: false,
          plannedDeparture: '2026-08-01T09:00:00.000Z',
          actualDeparture: null,
          departureDelayMinutes: null,
          predictedDeparture: '2026-08-01T09:20:00.000Z',
        },
        RESPONSE.stops[1],
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await screen.findByText('Gdańsk Główny')

    const predictedTime = new Date('2026-08-01T09:20:00.000Z').toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    const predictedLabel = screen.getByText(`(przewidywany: ${predictedTime})`)
    expect(predictedLabel).toHaveClass('italic')
    expect(predictedLabel).toHaveAttribute('title', expect.stringContaining('Przewidywana godzina'))
  })

  it('shows no predicted-time addendum when the API omits the field, only the plain planned/actual time', async () => {
    // RESPONSE fixture nie ma w ogóle pola predictedArrival/predictedDeparture
    // (brakujący klucz, nie null) -- nie może wywalić renderu ani pokazać "Invalid Date".
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await screen.findByText('Gdańsk Główny')

    expect(screen.queryByText(/przewidywany/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
  })

  it('shows an explicit "niedostępne" for fields the API does not provide, never a fabricated value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await screen.findByText('Gdańsk Główny')

    const unavailable = screen.getAllByText('niedostępne')
    expect(unavailable).toHaveLength(3) // Tabor, Prędkość, Długość składu
    unavailable.forEach((el) => expect(el).toHaveAttribute('title', 'Niedostępne w danych PKP'))
  })

  it('shows a disruption disclosure with the decoded message on a stop that has one', async () => {
    const withDisruption = {
      ...RESPONSE,
      stops: [{ ...RESPONSE.stops[0], disruptionMessages: ['Awaria sieci trakcyjnej'] }, RESPONSE.stops[1]],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(withDisruption)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await screen.findByText('Gdańsk Główny')

    expect(screen.getByText('Utrudnienie')).toBeInTheDocument()
    expect(screen.getByText('Awaria sieci trakcyjnej')).toBeInTheDocument()
  })

  it('shows no disruption disclosure on a stop without disruptionMessages (existing shape, field absent)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await screen.findByText('Gdańsk Główny')

    expect(screen.queryByText('Utrudnienie')).not.toBeInTheDocument()
  })
})
