// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionDetails } from './ConnectionDetails'
import { jsonResponse } from '@/test-utils/http'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// Fixture'y mają plan w 2026-08-01; bez zamrożenia zegara „teraz" (rzeczywista
// data) jest o lata później i każdy niepotwierdzony przystanek wychodziłby jako
// „brak danych" (patrz `resolveStopStatus`, `STALE_UNCONFIRMED_MS`). Tylko Date
// jest fake — Promisy/microtaski zostają realne, żeby RTL `findBy*` działało.
function freezeClock(iso: string): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

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
      platform: '3',
      track: '1',
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

/**
 * Nazwa stacji pojawia się teraz w kilku miejscach naraz (relacja w nagłówku,
 * podpis w pasku meta, wiersz trasy, etykieta wykresu) — zapytania o wiersz
 * przystanku muszą być zawężone do samej listy, inaczej trafiają w cztery
 * elementy naraz.
 */
function routeList() {
  return within(screen.getByRole('list', { name: 'Przebieg trasy' }))
}

/** Czeka na wczytanie danych bez opierania się na tekście, który występuje wielokrotnie. */
function waitForRoute() {
  return screen.findByRole('list', { name: 'Przebieg trasy' })
}

describe('ConnectionDetails', () => {
  it('shows a loading state, then the full stop list once data arrives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    expect(screen.getByText('Wczytywanie trasy…')).toBeInTheDocument()

    await waitForRoute()
    expect(routeList().getByText('Gdańsk Główny')).toBeInTheDocument()
    expect(routeList().getByText('Warszawa Centralna')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'EIC Grunwald' })).toBeInTheDocument()
    expect(screen.getByText('+7 min')).toBeInTheDocument()
    // Peron i tor jako dwie osobne wartości, nie sklejone „3/1" -- jedna
    // bywa znana bez drugiej (makieta §10).
    expect(screen.getByText(/peron 3 · tor 1/)).toBeInTheDocument()
  })

  it('shows the resolved carrier/category name instead of the raw code, when known', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.getAllByText('„PKP Intercity” Spółka Akcyjna').length).toBeGreaterThan(0)
    expect(screen.getByText('Express InterCity (EIC)')).toBeInTheDocument()
  })

  it('falls back to the raw carrier/category code when the name dictionary has no match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ ...RESPONSE, carrierName: null, categoryName: null }))
    )

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.getAllByText('IC').length).toBeGreaterThan(0)
    // Kod kategorii jest i w plakietce nagłówka, i w wierszu „Kategoria".
    expect(screen.getAllByText('EIC').length).toBeGreaterThan(0)
  })

  it('requests the exact scheduleId/orderId/operatingDate it was given', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(RESPONSE))
    vi.stubGlobal('fetch', fetchMock)

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

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

    await waitForRoute()
    // Nagłówek mówi to samo o celu podróży — tu sprawdzamy sam wiersz przystanku.
    expect(routeList().getByText('w trasie, ~+6 min')).toBeInTheDocument()
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

    await waitForRoute()
    expect(routeList().getByText('brak danych')).toBeInTheDocument()
    expect(routeList().queryByText('punktualnie')).not.toBeInTheDocument()
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

  it('shows the total number of stops, in the right Polish plural form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    expect(await screen.findByText('2 przystanki')).toBeInTheDocument()
  })

  it('renders "w trasie" for an unconfirmed stop once an earlier stop is already confirmed', async () => {
    // Fixture RESPONSE ma to od początku (Gdańsk potwierdzony, Warszawa
    // Centralna jeszcze nie) -- pociąg już wyjechał z Gdańska, więc Warszawa
    // powinna dostać "w trasie", nie mylące "jeszcze nie wyjechał".
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    await waitForRoute()
    // eslint-disable-next-line testing-library/no-node-access -- najbliższy <li> to cały wiersz przystanku, potrzebny żeby ograniczyć zapytanie do TEGO przystanku
    const row = routeList().getByText('Warszawa Centralna').closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('w trasie')).toBeInTheDocument()
    expect(within(row as HTMLElement).queryByText('punktualnie')).not.toBeInTheDocument()
    expect(within(row as HTMLElement).queryByText('jeszcze nie wyjechał')).not.toBeInTheDocument()
  })

  const NOT_STARTED_RESPONSE = {
    ...RESPONSE,
    stops: [
      { ...RESPONSE.stops[0], isConfirmed: false, actualDeparture: null, departureDelayMinutes: null, hasTrainStarted: false },
      { ...RESPONSE.stops[1], hasTrainStarted: false },
    ],
  }

  it('renders "jeszcze nie wyjechał" when the whole train has not left any stop yet, before its planned time', async () => {
    freezeClock('2026-08-01T10:00:00Z') // przed planowym przyjazdem do W-wy (11:20Z)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(NOT_STARTED_RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    await waitForRoute()
    // eslint-disable-next-line testing-library/no-node-access -- j.w., ograniczenie zapytania do wiersza tego przystanku
    const row = routeList().getByText('Warszawa Centralna').closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('jeszcze nie wyjechał')).toBeInTheDocument()
    expect(within(row as HTMLElement).queryByText('w trasie')).not.toBeInTheDocument()
  })

  it('renders "brak danych" (not a confident "jeszcze nie wyjechał") for an unconfirmed stop whose planned time is long past -- e.g. a frozen PKP feed', async () => {
    freezeClock('2026-08-01T13:00:00Z') // ~1h40m po planowym przyjeździe, wciąż zero potwierdzenia
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(NOT_STARTED_RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    await waitForRoute()
    // eslint-disable-next-line testing-library/no-node-access -- j.w.
    const row = routeList().getByText('Warszawa Centralna').closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('brak danych')).toBeInTheDocument()
    expect(within(row as HTMLElement).queryByText('jeszcze nie wyjechał')).not.toBeInTheDocument()
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

    await waitForRoute()
    // eslint-disable-next-line testing-library/no-node-access -- j.w., ograniczenie zapytania do wiersza tego przystanku
    const row = routeList().getByText('Gdańsk Główny').closest('li')
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
    await waitForRoute()

    const plannedTime = new Date('2026-08-01T05:55:00.000Z').toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    const actualTime = new Date('2026-08-01T20:15:00.000Z').toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    expect(screen.getAllByText(plannedTime).length).toBeGreaterThan(0)
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
    await waitForRoute()

    const predictedTime = new Date('2026-08-01T22:01:30.000Z').toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    const predictedLabel = routeList().getByText(predictedTime)
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
    await waitForRoute()

    const predictedTime = new Date('2026-08-01T09:20:00.000Z').toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    const predictedLabel = routeList().getByText(predictedTime)
    expect(predictedLabel).toHaveClass('italic')
    expect(predictedLabel).toHaveAttribute('title', expect.stringContaining('Przewidywana godzina'))
  })

  it('shows no predicted-time addendum when the API omits the field, only the plain planned/actual time', async () => {
    // RESPONSE fixture nie ma w ogóle pola predictedArrival/predictedDeparture
    // (brakujący klucz, nie null) -- nie może wywalić renderu ani pokazać "Invalid Date".
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.queryByTitle(/Przewidywana godzina/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
  })

  it('never shows fields PKP has no data for -- no empty rows, no fabricated values', async () => {
    // Tabor / prędkość / długość składu nie istnieją w żadnym endpoincie ani
    // słowniku PDP (sprawdzone na schemacie OpenAPI). Zweryfikowany na żywo
    // wniosek: lepiej ich nie pokazywać wcale niż trzymać trzy wiersze
    // „niedostępne" -- a już na pewno nie wolno zgadywać wartości.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.queryByText('Tabor')).not.toBeInTheDocument()
    expect(screen.queryByText('Prędkość')).not.toBeInTheDocument()
    expect(screen.queryByText('Długość składu')).not.toBeInTheDocument()
    expect(screen.queryByText('niedostępne')).not.toBeInTheDocument()
  })

  it('shows a disruption disclosure with the decoded message on a stop that has one', async () => {
    const withDisruption = {
      ...RESPONSE,
      stops: [{ ...RESPONSE.stops[0], disruptionMessages: ['Awaria sieci trakcyjnej'] }, RESPONSE.stops[1]],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(withDisruption)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.getByText('Utrudnienie')).toBeInTheDocument()
    // Treść jest i przy przystanku (gdzie), i w banerze pod trasą (co) — oba celowo.
    expect(screen.getAllByText('Awaria sieci trakcyjnej')).toHaveLength(2)
  })

  it('shows no disruption disclosure on a stop without disruptionMessages (existing shape, field absent)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.queryByText('Utrudnienie')).not.toBeInTheDocument()
  })

  it('titles the view with the train number passengers actually use, not the route name', async () => {
    // `nationalNumber` jest na żywym API wypełniony w 475/475 tras, `name`
    // tylko w 316 — numer jest więc pewniejszym i bardziej rozpoznawalnym
    // tytułem („EIC 1602"), a nazwa własna schodzi do wiersza obok.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ ...RESPONSE, nationalNumber: '1602' })))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.getByRole('heading', { name: 'EIC 1602' })).toBeInTheDocument()
    expect(screen.getByText('Nazwa pociągu')).toBeInTheDocument()
  })

  it('marks exactly one stop as the train position -- the last confirmed one', async () => {
    const response = {
      ...RESPONSE,
      stops: [
        { ...RESPONSE.stops[0], isConfirmed: true },
        { ...RESPONSE.stops[1], isConfirmed: true, actualArrival: '2026-08-01T11:20:00.000Z', arrivalDelayMinutes: 0 },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    const here = screen.getAllByText('Pociąg jest tutaj')
    expect(here).toHaveLength(1)
    // eslint-disable-next-line testing-library/no-node-access -- wiersz przystanku, żeby sprawdzić, PRZY KTÓRYM stoi znacznik
    expect(here[0].closest('li')).toHaveTextContent('Warszawa Centralna')
  })

  it('shows no train-position marker at all before the train confirms any stop', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(NOT_STARTED_RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.queryByText('Pociąg jest tutaj')).not.toBeInTheDocument()
  })

  it('shows a dwell badge only for a stop long enough to matter', async () => {
    // Na żywym API 4880 z 7173 postojów trwa dokładnie minutę — plakietka przy
    // każdym z nich to szum. Próg jest częścią informacji, nie kosmetyką.
    const response = {
      ...RESPONSE,
      stops: [
        { ...RESPONSE.stops[0], stopMinutes: 1 },
        { ...RESPONSE.stops[1], stopMinutes: 6 },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.getByText('Postój 6 min')).toBeInTheDocument()
    expect(screen.queryByText('Postój 1 min')).not.toBeInTheDocument()
  })

  it('warns on a stop where boarding is not possible', async () => {
    const response = {
      ...RESPONSE,
      stops: [{ ...RESPONSE.stops[0], stopTypeName: 'tylko dla wysiadających' }, RESPONSE.stops[1]],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.getByText('tylko dla wysiadających')).toBeInTheDocument()
  })

  it('says explicitly that there are no disruptions, instead of showing nothing', async () => {
    // „Brak utrudnień" i „nie udało się sprawdzić" to dwa różne komunikaty
    // (AGENTS.md #7) — cisza w tym miejscu byłaby nieodróżnialna od awarii.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.getByText('Aktualnie brak utrudnień na trasie.')).toBeInTheDocument()
  })

  it('copies the connection URL when the browser has no native share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    await userEvent.click(screen.getByRole('button', { name: /Kopiuj link/ }))

    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(await screen.findByText('Skopiowano link')).toBeInTheDocument()
  })
})
