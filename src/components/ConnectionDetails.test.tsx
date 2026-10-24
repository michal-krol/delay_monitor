// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as maplibregl from 'maplibre-gl'
import { ConnectionDetails } from './ConnectionDetails'
import { formatClockTime } from '@/lib/format'
import { jsonResponse } from '@/test-utils/http'
import { ArrivalIcon, DepartureIcon, TrainIcon, VehiclePositionIcon, type IconProps } from './icons'

/** Kształt ikony (dzieci `<svg>` bez `<title>`) — do porównania z ikoną ze słownika `icons.tsx`. */
function glyph(svg: Element | null | undefined): string | undefined {
  return svg?.innerHTML.replace(/<title>.*?<\/title>/, '')
}

function iconGlyph(Icon: (props: IconProps) => React.ReactNode): string | undefined {
  const { container, unmount } = render(<Icon />)
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access -- dekoracyjna ikona bez roli
  const shape = glyph(container.querySelector('svg'))
  unmount()
  return shape
}

vi.mock('maplibre-gl', () => {
  const marker = {
    setLngLat: vi.fn().mockReturnThis(),
    setPopup: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    getPopup: vi.fn(() => ({ setDOMContent: vi.fn() })),
  }
  const map = {
    fitBounds: vi.fn(),
    remove: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    once: vi.fn(),
    getSource: vi.fn(() => undefined),
    addSource: vi.fn(),
    addLayer: vi.fn(),
  }
  return {
    setWorkerUrl: vi.fn(),
    Map: vi.fn(function Map() {
      return map
    }),
    Marker: vi.fn(function Marker() {
      return marker
    }),
    Popup: vi.fn(function Popup() {
      const p = { content: null as HTMLElement | null, setDOMContent: (node: HTMLElement) => ((p.content = node), p) }
      return p
    }),
    LngLatBounds: vi.fn(function LngLatBounds() {
      return { extend: vi.fn() }
    }),
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  // Bez tego wywołania maplibregl.Marker (moduł mockowany raz dla całego pliku)
  // liczą się kumulacyjnie przez wszystkie testy -- fałszywie zielone/czerwone
  // asercje na `toHaveBeenCalledTimes` w testach mapy poniżej.
  vi.clearAllMocks()
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
    // Strzałka „skąd → dokąd” w nagłówku niesie znaczenie — czytnik słyszy „Gdańsk Główny do …”.
    expect(screen.getByRole('img', { name: 'do' })).toBeInTheDocument()
    // Odjazd i przyjazd mają własne ikony ze słownika, nie zegar (to pojęcie „godzina”).
    // Etykieta „Odjazd” jest też w kolumnie godziny wiersza (<span>) — pasek meta to <div>.
    const metaIcon = (label: string) =>
      // eslint-disable-next-line testing-library/no-node-access -- ikona MetaItem jest dekoracyjna (aria-hidden), bez roli
      glyph(screen.getByText(label, { selector: 'div' }).parentElement?.previousElementSibling?.querySelector('svg'))
    expect(metaIcon('Odjazd (plan)')).toBe(iconGlyph(DepartureIcon))
    expect(metaIcon('Przyjazd (plan)')).toBe(iconGlyph(ArrivalIcon))
    expect(screen.getByText('+7 min')).toBeInTheDocument()
    // Peron i tor jako dwie osobne wartości, nie sklejone „3/1" -- jedna
    // bywa znana bez drugiej (makieta §10).
    expect(screen.getByText('Peron 3 · tor 1')).toBeInTheDocument()
  })

  it('shows the last data at once, without the loading skeleton, when the same connection is opened again', async () => {
    const props = { scheduleId: '2026', orderId: '12345', operatingDate: '2026-08-01', trainLabel: 'EIC 1' }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))
    const { unmount } = render(<ConnectionDetails {...props} />)
    await waitForRoute()
    unmount()

    // Powrót na to samo połączenie: odświeżenie w tle jeszcze nie odpowiedziało.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})))
    render(<ConnectionDetails {...props} />)

    expect(screen.queryByText('Wczytywanie trasy…')).not.toBeInTheDocument()
    expect(routeList().getByText('Gdańsk Główny')).toBeInTheDocument()
  })

  it('reports the resolved train number once loaded, for a parent breadcrumb', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))
    const onLabelResolved = vi.fn()

    render(
      <ConnectionDetails
        scheduleId="2026"
        orderId="12345"
        operatingDate="2026-08-01"
        trainLabel="EIC 1"
        onLabelResolved={onLabelResolved}
      />
    )
    expect(onLabelResolved).not.toHaveBeenCalled()

    await waitForRoute()
    // Callback leci z useEffect, czyli po commicie, na którym findByRole już się
    // rozwiązał -- pod obciążeniem (CI, coverage) efekt bywa jeszcze nieopróżniony.
    await waitFor(() => expect(onLabelResolved).toHaveBeenCalledWith('EIC Grunwald'))
  })

  it('shows a weather card for the origin station in the right column', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.startsWith('/api/weather')
          ? jsonResponse({ available: false, reason: 'no-location' })
          : jsonResponse(RESPONSE)
      )
    )

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    // Gdańsk Główny to pierwszy przystanek (`stops[0]`) — pogoda punktu startu.
    expect(screen.getByRole('heading', { name: 'Pogoda dziś — Gdańsk Główny' })).toBeInTheDocument()
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
    // Każdy stan ma dokładnie jeden h1 (etykieta z linku), nie tylko wczytywanie i gotowe dane.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'EIC 1' })).toBeInTheDocument()
  })

  it('shows the server error message on a foreground 503 (hourly cap reached), not the generic "Spróbuj odświeżyć stronę"', async () => {
    const serverMessage = 'Chwilowo zbyt wiele zapytań o szczegóły połączeń. Spróbuj ponownie za kilka minut.'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: serverMessage }), { status: 503 }))
    )

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(serverMessage)
    expect(screen.queryByText(/Spróbuj odświeżyć stronę/)).not.toBeInTheDocument()
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

    expect(await screen.findByRole('status')).toHaveTextContent('PKP nie udostępnia teraz trasy tego połączenia.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

  it('renders "jeszcze nie przyjechał" for the terminal stop of a train that has not left yet (arrival-only, not "nie wyjechał")', async () => {
    freezeClock('2026-08-01T10:00:00Z') // przed planowym przyjazdem do W-wy (11:20Z)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(NOT_STARTED_RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)

    await waitForRoute()
    // Warszawa Centralna to przystanek KOŃCOWY tej trasy -- tam pociąg może
    // tylko „nie przyjechać", nie „nie wyjechać" (backlog: DelayBadge bez direction).
    // eslint-disable-next-line testing-library/no-node-access -- j.w., ograniczenie zapytania do wiersza tego przystanku
    const row = routeList().getByText('Warszawa Centralna').closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('jeszcze nie przyjechał')).toBeInTheDocument()
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

    const plannedTime = formatClockTime('2026-08-01T05:55:00.000Z')
    const actualTime = formatClockTime('2026-08-01T20:15:00.000Z')
    expect(screen.getAllByText(plannedTime).length).toBeGreaterThan(0)
    expect(screen.queryByText(new RegExp(actualTime))).not.toBeInTheDocument()
  })

  it('shows a predicted arrival time labelled "Przew." (not as a fact) when PKP projects one for an unconfirmed stop', async () => {
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

    const predictedTime = formatClockTime('2026-08-01T22:01:30.000Z')
    expect(routeList().getByText(predictedTime)).not.toHaveClass('italic')
    expect(routeList().getByText('Przew.')).toHaveAttribute('title', 'Przewidywana')
    // Plan zostaje jako mała linia pod prognozą.
    expect(routeList().getByText(new RegExp(`Plan ${formatClockTime('2026-08-01T21:29:30.000Z')}`))).toBeInTheDocument()
    expect(routeList().queryByText('Faktycznie')).not.toBeInTheDocument()
  })

  it('shows a predicted departure time labelled "Przew." (not as a fact) when PKP projects one for an unconfirmed stop', async () => {
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

    const first = within(routeList().getAllByRole('listitem')[0])
    expect(first.getByText(formatClockTime('2026-08-01T09:20:00.000Z'))).toBeInTheDocument()
    expect(first.getByText('Przew.')).toHaveAttribute('title', 'Przewidywana')
    expect(first.getByText(new RegExp(`Plan ${formatClockTime('2026-08-01T09:00:00.000Z')}`))).toBeInTheDocument()
    expect(first.queryByText('Faktycznie')).not.toBeInTheDocument()
  })

  it('shows no forecast label when the API omits the prediction field, only the plain planned/actual time', async () => {
    // RESPONSE fixture nie ma w ogóle pola predictedArrival/predictedDeparture
    // (brakujący klucz, nie null) -- nie może wywalić renderu ani pokazać "Invalid Date".
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(routeList().queryByText('Przew.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
    // Potwierdzony odjazd z Gdańska = fakt, niepotwierdzony przyjazd bez prognozy = plan.
    expect(within(routeList().getAllByRole('listitem')[0]).getByText('Faktycznie')).toBeInTheDocument()
    expect(within(routeList().getAllByRole('listitem')[1]).getByText('Plan')).toBeInTheDocument()
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
    // Pozycja pociągu = kropka pojazdu (`VehiclePositionIcon`), nie ikona kolei — jedno pojęcie, jedna ikona.
    // eslint-disable-next-line testing-library/no-node-access -- dekoracyjna ikona bez roli
    expect(glyph(here[0].querySelector('svg'))).toBe(iconGlyph(VehiclePositionIcon))
  })

  it('shows no train-position marker at all before the train confirms any stop', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(NOT_STARTED_RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.queryByText('Pociąg jest tutaj')).not.toBeInTheDocument()
  })

  // Pociąg bez ŻADNEJ realizacji (żaden przystanek `isConfirmed`, brak actuals,
  // `trainStatus: 'S'` na stałe) — np. Warszawska Kolej Dojazdowa. Window trasy:
  // odjazd 09:00Z (Gdańsk), przyjazd 11:20Z (Warszawa).
  const SCHEDULE_ONLY_RESPONSE = {
    ...RESPONSE,
    trainStatus: 'S',
    stops: [
      { ...RESPONSE.stops[0], isConfirmed: false, actualDeparture: null, departureDelayMinutes: null, hasTrainStarted: false },
      { ...RESPONSE.stops[1], isConfirmed: false, hasTrainStarted: false },
    ],
  }

  it('projects the position from the schedule for a train with zero realization mid-route', async () => {
    freezeClock('2026-08-01T10:00:00Z') // po odjeździe z Gdańska (09:00Z), przed przyjazdem do W-wy (11:20Z)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(SCHEDULE_ONLY_RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="Os 1" />)
    await waitForRoute()

    // Zastrzeżenie widoczne
    expect(screen.getByText('Brak potwierdzeń przejazdu z PKP.')).toBeInTheDocument()
    // Znacznik pozycji z dopiskiem „wg rozkładu", na minionym przystanku (Gdańsk)
    const here = screen.getAllByText('Szacowana pozycja — wg rozkładu')
    expect(here).toHaveLength(1)
    // eslint-disable-next-line testing-library/no-node-access -- wiersz przystanku, przy którym stoi znacznik
    expect(here[0].closest('li')).toHaveTextContent('Gdańsk Główny')
    // Nagłówek: „w trasie"
    expect(screen.getAllByText('w trasie').length).toBeGreaterThan(0)
    // Miniony przystanek „w trasie", przyszły „jeszcze nie przyjechał"
    // eslint-disable-next-line testing-library/no-node-access
    const future = routeList().getByText('Warszawa Centralna').closest('li')
    expect(within(future as HTMLElement).getByText('jeszcze nie przyjechał')).toBeInTheDocument()
  })

  it('does not project before the scheduled departure — behaves exactly as today', async () => {
    freezeClock('2026-08-01T08:00:00Z') // przed odjazdem z Gdańska
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(SCHEDULE_ONLY_RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="Os 1" />)
    await waitForRoute()

    expect(screen.queryByText('Brak potwierdzeń przejazdu z PKP.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Pociąg jest tutaj/)).not.toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-node-access
    const origin = routeList().getByText('Gdańsk Główny').closest('li')
    expect(within(origin as HTMLElement).getByText('jeszcze nie wyjechał')).toBeInTheDocument()
  })

  it('does not project once the whole schedule is in the past — falls back to "brak danych"', async () => {
    freezeClock('2026-08-01T12:00:00Z') // 40 min po planowym przyjeździe, wciąż zero potwierdzeń
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(SCHEDULE_ONLY_RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="Os 1" />)
    await waitForRoute()

    expect(screen.queryByText('Brak potwierdzeń przejazdu z PKP.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Pociąg jest tutaj/)).not.toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-node-access
    const future = routeList().getByText('Warszawa Centralna').closest('li')
    expect(within(future as HTMLElement).getByText('brak danych')).toBeInTheDocument()
  })

  it('uses the real position (no "wg rozkładu") as soon as any stop is confirmed', async () => {
    freezeClock('2026-08-01T10:00:00Z')
    const response = {
      ...SCHEDULE_ONLY_RESPONSE,
      stops: [
        { ...SCHEDULE_ONLY_RESPONSE.stops[0], isConfirmed: true, actualDeparture: '2026-08-01T09:05:00.000Z', departureDelayMinutes: 5 },
        { ...SCHEDULE_ONLY_RESPONSE.stops[1], hasTrainStarted: true },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="Os 1" />)
    await waitForRoute()

    expect(screen.queryByText('Brak potwierdzeń przejazdu z PKP.')).not.toBeInTheDocument()
    const here = screen.getAllByText('Pociąg jest tutaj')
    expect(here).toHaveLength(1)
    // eslint-disable-next-line testing-library/no-node-access
    expect(here[0].closest('li')).toHaveTextContent('Gdańsk Główny')
  })

  it('does not project "w trasie" for a cancelled stop inside the schedule window', async () => {
    freezeClock('2026-08-01T10:00:00Z')
    const response = {
      ...SCHEDULE_ONLY_RESPONSE,
      stops: [
        { ...SCHEDULE_ONLY_RESPONSE.stops[0], isCancelled: true },
        SCHEDULE_ONLY_RESPONSE.stops[1],
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="Os 1" />)
    await waitForRoute()

    expect(screen.queryByText('Brak potwierdzeń przejazdu z PKP.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Pociąg jest tutaj/)).not.toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-node-access
    const row = routeList().getByText('Gdańsk Główny').closest('li')
    expect(within(row as HTMLElement).getByText('odwołany')).toBeInTheDocument()
  })

  // Pociąg Z potwierdzeniami, ale PRZETERMINOWANYMI — SKM/KM/WKD, PKP potwierdza
  // paczkami z opóźnieniem. Gdańsk potwierdzony (odjazd 09:00Z), dalej co ~20 min:
  // Tczew 09:20, Malbork 09:40, Warszawa 11:20 — wszystko niepotwierdzone.
  const STALE_CONFIRMED_RESPONSE = {
    ...RESPONSE,
    trainStatus: 'P',
    stops: [
      { ...RESPONSE.stops[0], isConfirmed: true, actualDeparture: '2026-08-01T09:00:00.000Z', departureDelayMinutes: 0, hasTrainStarted: false },
      {
        stationId: '4600', stationName: 'Tczew',
        plannedArrival: '2026-08-01T09:20:00.000Z', actualArrival: null, arrivalDelayMinutes: null,
        plannedDeparture: '2026-08-01T09:22:00.000Z', actualDeparture: null, departureDelayMinutes: null,
        isCancelled: false, isConfirmed: false, platform: null, hasTrainStarted: true,
      },
      {
        stationId: '4610', stationName: 'Malbork',
        plannedArrival: '2026-08-01T09:40:00.000Z', actualArrival: null, arrivalDelayMinutes: null,
        plannedDeparture: '2026-08-01T09:42:00.000Z', actualDeparture: null, departureDelayMinutes: null,
        isCancelled: false, isConfirmed: false, platform: null, hasTrainStarted: true,
      },
      { ...RESPONSE.stops[1], hasTrainStarted: true },
    ],
  }

  it('projects the marker forward from a stale confirmed stop (SKM/KM batched confirmations)', async () => {
    freezeClock('2026-08-01T09:45:00Z') // rozkład stawia pociąg za Malborkiem (09:40), a PKP potwierdził tylko Gdańsk
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(STALE_CONFIRMED_RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="R 1" />)
    await waitForRoute()

    // Nie mylić z trybem „zero potwierdzeń" — ten ma potwierdzony Gdańsk.
    expect(screen.queryByText('Brak potwierdzeń przejazdu z PKP.')).not.toBeInTheDocument()
    const here = screen.getAllByText('Szacowana pozycja — rozkład i ostatnie potwierdzenie')
    expect(here).toHaveLength(1)
    // Marker przeskoczył z Gdańska (ostatni potwierdzony) na Malbork (projekcja).
    // eslint-disable-next-line testing-library/no-node-access -- wiersz przystanku
    expect(here[0].closest('li')).toHaveTextContent('Malbork')
    expect(screen.getAllByText('w trasie').length).toBeGreaterThan(0)
  })

  it('keeps the plain marker on the confirmed stop while confirmations keep up (< 2 stops behind)', async () => {
    freezeClock('2026-08-01T09:25:00Z') // rozkład ledwo za Tczewem (09:20) — tylko 1 przystanek za potwierdzeniem
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(STALE_CONFIRMED_RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="R 1" />)
    await waitForRoute()

    expect(screen.queryByText(/szacowane z rozkładu/)).not.toBeInTheDocument()
    const here = screen.getAllByText('Pociąg jest tutaj')
    expect(here).toHaveLength(1)
    // eslint-disable-next-line testing-library/no-node-access
    expect(here[0].closest('li')).toHaveTextContent('Gdańsk Główny')
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

  it('has no share control of its own -- sharing lives in the page TopBar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    await waitForRoute()

    expect(screen.queryByRole('button', { name: /Kopiuj link|Udostępnij/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Udostępnij połączenie')).not.toBeInTheDocument()
  })

  describe('route list', () => {
    /** Trasa z `count` przystanków co 5 min od 09:00Z; potwierdzone do `confirmedUpTo` włącznie (bez opóźnienia). */
    function longRoute(count: number, confirmedUpTo: number) {
      return {
        ...RESPONSE,
        stops: Array.from({ length: count }, (_, index) => {
          const planned = new Date(Date.UTC(2026, 7, 1, 9, index * 5)).toISOString()
          const confirmed = index <= confirmedUpTo
          return {
            stationId: String(2000 + index),
            stationName: `Przystanek ${index}`,
            plannedArrival: index === 0 ? null : planned,
            actualArrival: confirmed && index > 0 ? planned : null,
            arrivalDelayMinutes: confirmed && index > 0 ? 0 : null,
            plannedDeparture: index === count - 1 ? null : planned,
            actualDeparture: confirmed && index < count - 1 ? planned : null,
            departureDelayMinutes: confirmed && index < count - 1 ? 0 : null,
            isCancelled: false,
            isConfirmed: confirmed,
            platform: null,
            track: null,
            hasTrainStarted: true,
          }
        }),
      }
    }

    it('stop name links to its station (validated id, encoded name)', async () => {
      const response = {
        ...RESPONSE,
        stops: [{ ...RESPONSE.stops[0], stationName: 'Gdańsk Główny/Test & Co' }, RESPONSE.stops[1]],
      }
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

      render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
      await waitForRoute()

      expect(routeList().getByRole('link', { name: /Gdańsk Główny\/Test & Co/ })).toHaveAttribute(
        'href',
        `/station/7500?name=${encodeURIComponent('Gdańsk Główny/Test & Co')}`
      )
    })

    it('invalid station id renders plain text', async () => {
      const response = { ...RESPONSE, stops: [{ ...RESPONSE.stops[0], stationId: '75 00/../x' }, RESPONSE.stops[1]] }
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(response)))

      render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
      await waitForRoute()

      expect(routeList().getByText('Gdańsk Główny')).toBeInTheDocument()
      expect(routeList().queryByRole('link', { name: /Gdańsk Główny/ })).not.toBeInTheDocument()
      expect(routeList().getByRole('link', { name: /Warszawa Centralna/ })).toBeInTheDocument()
    })

    it('short route has no toggle', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

      render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
      await waitForRoute()

      expect(screen.queryByRole('button', { name: /Pokaż całą trasę|Zwiń trasę/ })).not.toBeInTheDocument()
    })

    it("long route shows only the window and 'Pokaż całą trasę' (aria-expanded=false); expanding shows all, no refetch", async () => {
      freezeClock('2026-08-01T09:22:00Z') // pociąg na przystanku 4 (09:20), przystanek 5 o 09:25
      const fetchMock = vi.fn().mockImplementation(() => jsonResponse(longRoute(14, 4)))
      vi.stubGlobal('fetch', fetchMock)

      render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
      await waitForRoute()

      expect(routeList().getAllByRole('listitem')).toHaveLength(3)
      expect(routeList().getByText('Przystanek 4')).toBeInTheDocument()
      expect(routeList().getByText('Przystanek 6')).toBeInTheDocument()
      expect(routeList().queryByText('Przystanek 3')).not.toBeInTheDocument()
      expect(routeList().getByText('Pociąg jest tutaj')).toBeInTheDocument()
      const toggle = screen.getByRole('button', { name: /Pokaż całą trasę/ })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      const trainCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/train')).length
      expect(trainCalls()).toBe(1)

      fireEvent.click(toggle)

      expect(routeList().getAllByRole('listitem')).toHaveLength(14)
      expect(screen.getByRole('button', { name: 'Zwiń trasę' })).toHaveAttribute('aria-expanded', 'true')
      expect(trainCalls()).toBe(1) // rozwinięcie to stan lokalny, zero zapytań (#3)
    })

    it('expanding, collapsing and clicking a row never refetch /api/train (#3)', async () => {
      freezeClock('2026-08-01T09:22:00Z')
      const fetchMock = vi.fn().mockImplementation(() => jsonResponse(longRoute(14, 4)))
      vi.stubGlobal('fetch', fetchMock)

      render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
      await waitForRoute()

      fireEvent.click(screen.getByRole('button', { name: /Pokaż całą trasę/ }))
      fireEvent.click(routeList().getByText('Przystanek 9'))
      fireEvent.click(screen.getByRole('button', { name: 'Zwiń trasę' }))
      fireEvent.click(routeList().getByText('Przystanek 5'))

      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/train'))).toHaveLength(1)
    })
  })

  describe('background refresh', () => {
    // Poza `/api/train` komponent bije jeszcze w `/api/weather` (pogoda punktu
    // startu) — te testy pilnują odpytywania samej trasy, więc liczą tylko
    // wywołania `/api/train`.
    const trainUrls = (m: ReturnType<typeof vi.fn>) =>
      m.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/api/train'))
    const trainCalls = (m: ReturnType<typeof vi.fn>) => trainUrls(m).length

    const CONFIRMED_SECOND_STOP = {
      ...RESPONSE,
      stops: [
        RESPONSE.stops[0],
        { ...RESPONSE.stops[1], isConfirmed: true, actualArrival: '2026-08-01T11:21:00.000Z', arrivalDelayMinutes: 1 },
      ],
    }

    const HOURLY_CAP_MESSAGE = 'Chwilowo zbyt wiele zapytań o szczegóły połączeń. Spróbuj ponownie za kilka minut.'
    const REFRESH_MS = 5 * 60_000

    // Odpytywanie idzie przez `setTimeout` (`usePolling`), więc te testy używają
    // pełnych fałszywych zegarów i `advanceTimersByTimeAsync` zamiast samego
    // zamrożonego `Date`. `vi.waitFor` sam popycha fałszywe zegary — w
    // przeciwieństwie do RTL `findBy*`, które ich nie widzi.
    function startClock(iso: string): void {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(iso))
    }
    const untilRoute = () => vi.waitFor(() => expect(routeList().getByText('Warszawa Centralna')).toBeInTheDocument())
    // eslint-disable-next-line testing-library/no-node-access
    const wwaRow = () => routeList().getByText('Warszawa Centralna').closest('li') as HTMLElement

    function setHidden(value: boolean): void {
      Object.defineProperty(document, 'hidden', { value, configurable: true })
    }
    afterEach(() => setHidden(false))

    function renderDetails() {
      render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 1" />)
    }

    it('refetches after the 5 min tick, updating stops without a skeleton flash', async () => {
      startClock('2026-08-01T10:00:00Z')
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse(RESPONSE))
        .mockImplementation(() => jsonResponse(CONFIRMED_SECOND_STOP))
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()
      expect(trainCalls(fetchMock)).toBe(1)

      await vi.advanceTimersByTimeAsync(REFRESH_MS - 1000)
      expect(trainCalls(fetchMock)).toBe(1) // przed tikiem cisza

      await vi.advanceTimersByTimeAsync(1000)
      await vi.waitFor(() => expect(within(wwaRow()).getByText('+1 min')).toBeInTheDocument())
      expect(trainCalls(fetchMock)).toBe(2)
      // Nigdy nie wróciło do stanu ładowania
      expect(screen.queryByText('Wczytywanie trasy…')).not.toBeInTheDocument()
    })

    // Zmiana zachowania (PR 5, jedna polityka widoczności dla całego odpytywania):
    // fokus okna nie odświeża już danych, więc nie ma zapytania „w gratisie" do PKP.
    it('does not refetch on window focus', async () => {
      startClock('2026-08-01T10:00:00Z')
      const fetchMock = vi.fn().mockImplementation(() => jsonResponse(RESPONSE))
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()

      await vi.advanceTimersByTimeAsync(2 * 60_000)
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(0)
      expect(trainCalls(fetchMock)).toBe(1)
    })

    // Powrót na kartę odświeża tylko wtedy, gdy tik minął w ukryciu (zero
    // dodatkowego kosztu wobec PKP względem samego timera).
    it('returning to the tab without a paused tick does not refetch', async () => {
      startClock('2026-08-01T10:00:00Z')
      const fetchMock = vi.fn().mockImplementation(() => jsonResponse(RESPONSE))
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()

      await vi.advanceTimersByTimeAsync(2 * 60_000)
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
      expect(trainCalls(fetchMock)).toBe(1)
    })

    it('return to tab after a paused tick fetches with background=1', async () => {
      startClock('2026-08-01T10:00:00Z')
      const fetchMock = vi.fn().mockImplementation(() => jsonResponse(RESPONSE))
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()

      setHidden(true)
      await vi.advanceTimersByTimeAsync(REFRESH_MS)
      expect(trainCalls(fetchMock)).toBe(1) // tik przypadł w ukryciu -- bez zapytania

      setHidden(false)
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() => expect(trainCalls(fetchMock)).toBe(2))
      expect(new URL(trainUrls(fetchMock)[1], 'http://localhost').searchParams.get('background')).toBe('1')
    })

    it('keeps the last good data (no error banner) when a background refetch fails', async () => {
      startClock('2026-08-01T10:00:00Z')
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse(RESPONSE))
        .mockImplementation(() => Promise.resolve(new Response('boom', { status: 500 })))
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()

      await vi.advanceTimersByTimeAsync(REFRESH_MS)
      await vi.waitFor(() => expect(trainCalls(fetchMock)).toBe(2))

      expect(screen.queryByText('Nie udało się pobrać szczegółów połączenia.')).not.toBeInTheDocument()
      expect(routeList().getByText('Warszawa Centralna')).toBeInTheDocument()
    })

    it('sends background=1 only on a background refetch, never the initial load', async () => {
      startClock('2026-08-01T10:00:00Z')
      const fetchMock = vi.fn().mockImplementation(() => jsonResponse(RESPONSE))
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()

      expect(trainUrls(fetchMock)).toHaveLength(1)
      expect(new URL(trainUrls(fetchMock)[0], 'http://localhost').searchParams.has('background')).toBe(false)

      // Kolejny tik -- dociąganie w tle, tym razem Z parametrem.
      await vi.advanceTimersByTimeAsync(REFRESH_MS)
      await vi.waitFor(() => expect(trainUrls(fetchMock)).toHaveLength(2))
      expect(new URL(trainUrls(fetchMock)[1], 'http://localhost').searchParams.get('background')).toBe('1')
    })

    it('keeps the last good data (no error banner) when a background refetch is rejected with 503 (hourly cap reached)', async () => {
      startClock('2026-08-01T10:00:00Z')
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse(RESPONSE))
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify({ error: HOURLY_CAP_MESSAGE }), { status: 503 }))
        )
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()

      await vi.advanceTimersByTimeAsync(REFRESH_MS)
      await vi.waitFor(() => expect(trainCalls(fetchMock)).toBe(2))

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText(HOURLY_CAP_MESSAGE)).not.toBeInTheDocument()
      expect(routeList().getByText('Warszawa Centralna')).toBeInTheDocument()
    })

    it('after a failed background refresh shows the warning + retry, the route stays; retry is a foreground fetch (no background=1)', async () => {
      startClock('2026-08-01T10:00:00Z')
      // Osobny licznik tylko dla /api/train -- /api/weather bije w ten sam
      // globalny mock, więc liczenie „które to wywołanie fetch" po kolei
      // (mockImplementationOnce) trafiłoby przypadkiem w zapytanie o pogodę.
      let trainCallCount = 0
      const fetchMock = vi.fn((url: string) => {
        if (String(url).startsWith('/api/weather')) return jsonResponse({ available: false, reason: 'no-location' })
        trainCallCount++
        return trainCallCount === 1
          ? jsonResponse(RESPONSE)
          : Promise.resolve(new Response(JSON.stringify({ error: HOURLY_CAP_MESSAGE }), { status: 503 }))
      })
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()
      // Świeże dane, żadnej próby w tle jeszcze nie było -- neutralny wiek, bez ostrzeżenia i ponowienia.
      expect(screen.getByTestId('data-age')).toHaveTextContent('Pobrano przed chwilą')
      expect(screen.getByTestId('data-age')).not.toHaveClass('text-warning-text')
      expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).not.toBeInTheDocument()

      // Tik po 5 min pada (503 -- limit godzinowy, patrz route.ts). Ostatni
      // dobry stan zostaje na ekranie, ale musi być widać, że jest nieświeży.
      await vi.advanceTimersByTimeAsync(REFRESH_MS)

      await vi.waitFor(() =>
        expect(screen.getByTestId('data-age')).toHaveTextContent(
          'Nie udało się odświeżyć — pokazujemy ostatnie dane · Pobrano 5 min temu'
        )
      )
      expect(screen.getByTestId('data-age')).toHaveClass('text-warning-text')
      expect(routeList().getByText('Warszawa Centralna')).toBeInTheDocument()
      expect(trainCalls(fetchMock)).toBe(2)

      // Ręczne ponowienie = pierwszoplanowe pobranie: bez `background=1`.
      const retry = screen.getByRole('button', { name: 'Spróbuj ponownie' })
      expect(retry).toHaveClass('control-44')
      fireEvent.click(retry)
      await vi.waitFor(() => expect(trainCalls(fetchMock)).toBe(3))
      expect(new URL(trainUrls(fetchMock)[2], 'http://localhost').searchParams.has('background')).toBe(false)
    })

    it('background 503 after a clock jump of an hour shows the fetch age in minutes, as formatAgo does', async () => {
      startClock('2026-08-01T10:00:00Z')
      let trainCallCount = 0
      const fetchMock = vi.fn((url: string) => {
        if (String(url).startsWith('/api/weather')) return jsonResponse({ available: false, reason: 'no-location' })
        trainCallCount++
        return trainCallCount === 1
          ? jsonResponse(RESPONSE)
          : Promise.resolve(new Response(JSON.stringify({ error: HOURLY_CAP_MESSAGE }), { status: 503 }))
      })
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()

      // Zegar skacze o godzinę (np. uśpiony laptop), tik pada (503) -- wiek
      // danych ma przejść przez `formatAge()` (godziny + minuty), nie zostać
      // `formatAgo` (jedna implementacja wieku „temu"): 65 min < 90 min zostaje w minutach.
      // `setSystemTime` przesuwa też zaplanowane timery, więc do tiku wciąż brakuje 5 min.
      vi.setSystemTime(new Date('2026-08-01T11:00:00Z'))
      await vi.advanceTimersByTimeAsync(REFRESH_MS)

      await vi.waitFor(() => expect(screen.getByTestId('data-age')).toHaveTextContent('Pobrano 65 min temu'))
      expect(trainCalls(fetchMock)).toBe(2)
    })

    it('successful refresh clears the warning and the retry button, the age restarts', async () => {
      startClock('2026-08-01T10:00:00Z')
      // Jak wyżej -- osobny licznik tylko dla /api/train, /api/weather nie
      // wchodzi w tę sekwencję.
      let trainCallCount = 0
      const fetchMock = vi.fn((url: string) => {
        if (String(url).startsWith('/api/weather')) return jsonResponse({ available: false, reason: 'no-location' })
        trainCallCount++
        if (trainCallCount === 1) return jsonResponse(RESPONSE)
        if (trainCallCount === 2) return Promise.resolve(new Response('boom', { status: 503 }))
        return jsonResponse(CONFIRMED_SECOND_STOP)
      })
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()

      await vi.advanceTimersByTimeAsync(REFRESH_MS)
      await vi.waitFor(() => expect(screen.getByTestId('data-age')).toHaveTextContent('Nie udało się odświeżyć'))

      // Ponowienie po nieudanej próbie w tle (znów 5 min), tym razem udane --
      // wskaźnik wieku musi zgasnąć. Czekamy na pozytywny sygnał, że
      // aktualizacja faktycznie doszła (potwierdzony przyjazd na drugim
      // przystanku), nie na samą absencję -- inaczej asercja przeszłaby
      // również PRZED zastosowaniem aktualizacji.
      await vi.advanceTimersByTimeAsync(REFRESH_MS)
      await vi.waitFor(() => expect(within(wwaRow()).getByText('+1 min')).toBeInTheDocument())

      expect(screen.getByTestId('data-age')).not.toHaveTextContent('Nie udało się odświeżyć')
      expect(screen.getByTestId('data-age')).not.toHaveClass('text-warning-text')
      expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).not.toBeInTheDocument()
      expect(trainCalls(fetchMock)).toBe(3)
    })

    it('expanded state survives a background refresh and does not refetch', async () => {
      startClock('2026-08-01T09:22:00Z')
      const stops = Array.from({ length: 12 }, (_, index) => {
        const planned = new Date(Date.UTC(2026, 7, 1, 9, index * 5)).toISOString()
        const confirmed = index <= 4
        return {
          stationId: String(2000 + index),
          stationName: `Przystanek ${index}`,
          plannedArrival: planned,
          actualArrival: confirmed ? planned : null,
          arrivalDelayMinutes: confirmed ? 0 : null,
          plannedDeparture: planned,
          actualDeparture: confirmed ? planned : null,
          departureDelayMinutes: confirmed ? 0 : null,
          isCancelled: false,
          isConfirmed: confirmed,
          platform: null,
          track: null,
          hasTrainStarted: true,
        }
      })
      const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ ...RESPONSE, stops }))
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await vi.waitFor(() => expect(screen.getByRole('button', { name: /Pokaż całą trasę/ })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: /Pokaż całą trasę/ }))
      expect(routeList().getAllByRole('listitem')).toHaveLength(12)
      expect(trainCalls(fetchMock)).toBe(1) // samo rozwinięcie nie pyta PKP

      await vi.advanceTimersByTimeAsync(REFRESH_MS)
      await vi.waitFor(() => expect(trainCalls(fetchMock)).toBe(2))
      expect(screen.getByRole('button', { name: 'Zwiń trasę' })).toHaveAttribute('aria-expanded', 'true')
      expect(routeList().getAllByRole('listitem')).toHaveLength(12)
    })

    it('stops refetching once the train has reached its final stop', async () => {
      startClock('2026-08-01T12:00:00Z')
      const arrived = {
        ...RESPONSE,
        stops: [
          RESPONSE.stops[0],
          { ...RESPONSE.stops[1], isConfirmed: true, actualArrival: '2026-08-01T11:25:00.000Z', arrivalDelayMinutes: 5 },
        ],
      }
      const fetchMock = vi.fn().mockImplementation(() => jsonResponse(arrived))
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()
      expect(trainCalls(fetchMock)).toBe(1)

      await vi.advanceTimersByTimeAsync(3 * REFRESH_MS)
      expect(trainCalls(fetchMock)).toBe(1)
    })

    it('a fully cancelled train: "odwołany" on every row, no countdown to the destination, no further polling', async () => {
      startClock('2026-08-01T10:00:00Z')
      const cancelled = {
        ...RESPONSE,
        stops: RESPONSE.stops.map((stop) => ({ ...stop, isCancelled: true, isConfirmed: false })),
      }
      const fetchMock = vi.fn().mockImplementation(() => jsonResponse(cancelled))
      vi.stubGlobal('fetch', fetchMock)

      renderDetails()
      await untilRoute()

      // eslint-disable-next-line testing-library/no-node-access -- ograniczenie zapytania do wiersza przystanku
      const rows = [routeList().getByText('Gdańsk Główny'), routeList().getByText('Warszawa Centralna')].map((name) => name.closest('li') as HTMLElement)
      for (const row of rows) expect(within(row).getByText('odwołany')).toBeInTheDocument()
      expect(within(screen.getByTestId('arrival-block')).queryByText(/^za /)).not.toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(3 * REFRESH_MS)
      expect(trainCalls(fetchMock)).toBe(1)
    })

    it('finished journey shows the neutral age without a warning or a retry', async () => {
      // Ten test musi puścić realny zegar odliczania („za ile", co 30 s) naprzód,
      // żeby sprawdzić, że próg 2×BACKGROUND_REFRESH_MS sam z siebie nie pokazuje
      // wskaźnika po zakończeniu podróży (patrz `jsonResponse`: sprawdzone, że
      // `advanceTimersByTimeAsync` z tym helperem działa poprawnie).
      startClock('2026-08-01T12:00:00Z')
      const arrived = {
        ...RESPONSE,
        stops: [
          RESPONSE.stops[0],
          { ...RESPONSE.stops[1], isConfirmed: true, actualArrival: '2026-08-01T11:25:00.000Z', arrivalDelayMinutes: 5 },
        ],
      }
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(arrived)))

      renderDetails()
      await untilRoute()

      // 15 minut odliczania (co 30 s), niezależnie od tego, że podróż się
      // skończyła i dociąganie w tle jest zatrzymane (test wyżej) -- gdyby
      // wskaźnik wieku nie sprawdzał końca podróży, dawno przekroczyłby próg
      // i pokazał się mimo że nic już nigdy nie odświeży tych danych.
      await vi.advanceTimersByTimeAsync(15 * 60_000)

      expect(screen.getByTestId('data-age')).toHaveTextContent('Pobrano 15 min temu')
      expect(screen.getByTestId('data-age')).not.toHaveClass('text-warning-text')
      expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).not.toBeInTheDocument()
    })

    it('shows the age in the warning colour (no retry, no failure text) once it passes 2x the refresh interval on a hidden tab', async () => {
      startClock('2026-08-01T10:00:00Z')
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

      renderDetails()
      await untilRoute()

      setHidden(true) // ukryta karta: tiki dociągania są pomijane, zegar „Pobrano" idzie dalej
      await vi.advanceTimersByTimeAsync(12 * 60_000)

      await vi.waitFor(() => expect(screen.getByTestId('data-age')).toHaveTextContent('Pobrano 12 min temu'))
      expect(screen.getByTestId('data-age')).toHaveClass('text-warning-text')
      expect(screen.getByTestId('data-age')).not.toHaveTextContent('Nie udało się odświeżyć')
      expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).not.toBeInTheDocument()
    })

    it('shows "Pobrano … temu" from lastSuccessAt (browser fetch time), neutral and not announced', async () => {
      startClock('2026-08-01T10:00:00Z')
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

      renderDetails()
      await untilRoute()
      expect(screen.getByTestId('data-age')).toHaveTextContent('Pobrano przed chwilą')

      await vi.advanceTimersByTimeAsync(3 * 60_000)
      await vi.waitFor(() => expect(screen.getByTestId('data-age')).toHaveTextContent('Pobrano 3 min temu'))
      expect(screen.getByTestId('data-age')).not.toHaveClass('text-warning-text')
      // Zegar odliczania tyka co 30 s -- to nie jest komunikat dla czytnika.
      expect(screen.getByTestId('data-age')).not.toHaveAttribute('aria-live')
    })
  })
})

describe('route map', () => {
  it('explains unavailable map coordinates while keeping the route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(RESPONSE)))
    freezeClock('2026-08-01T10:00:00.000Z')
    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 2706" />)

    expect(await screen.findByText('EIC Grunwald')).toBeInTheDocument()
    expect(screen.getByText('Mapa trasy')).toBeInTheDocument()
    expect(screen.getByText('Brak współrzędnych do pokazania mapy trasy.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Przebieg trasy' })).toBeInTheDocument()
    expect(maplibregl.Map).not.toHaveBeenCalled()
  })

  it('renders the map with a marker once at least two stops carry coordinates', async () => {
    const withCoords = {
      ...RESPONSE,
      stops: [
        { ...RESPONSE.stops[0], lat: 54.355, lon: 18.646 },
        { ...RESPONSE.stops[1], lat: 52.2288207, lon: 21.00316 },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(withCoords)))
    freezeClock('2026-08-01T10:00:00.000Z')
    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 2706" />)

    expect(await screen.findByText('Mapa trasy')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Mapa trasy' })).toHaveLength(1)
    expect(screen.getAllByRole('list', { name: 'Przebieg trasy' })).toHaveLength(1)
    expect(screen.getByText('Schemat połączeń między stacjami — nie przedstawia przebiegu torów.')).toBeInTheDocument()
    // Etykieta „szacowane" musi być widoczna OD RAZU, nie dopiero po kliknięciu
    // w kropkę markera (AGENTS.md #7) -- pierwszy przystanek jest potwierdzony
    // (isConfirmed: true w RESPONSE), więc resolveInterpolatedPosition zwraca
    // pozycję i podpis się renderuje.
    const caption = screen.getByText(ESTIMATED_POSITION_CAPTION)
    // Podpis niesie glif pociągu ze słownika ikon (`TrainIcon`), tak jak marker na mapie.
    // eslint-disable-next-line testing-library/no-node-access -- dekoracyjna ikona bez roli
    expect(glyph(caption.querySelector('svg'))).toBe(iconGlyph(TrainIcon))
    // Nigdy „na żywo" / „Live" dla PKP -- to szacunek, nie GPS.
    expect(screen.queryByText(/na żywo|live/i)).not.toBeInTheDocument()

    // Weryfikacja realnego markera, nie tylko tekstu obok (wzorzec z MapView.test.tsx):
    // 2 piny (przystanki z coords) + 1 mover (pozycja pociągu) = 3 wywołania Marker.
    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(3))
    const calls = vi.mocked(maplibregl.Marker).mock.calls
    const moverCallIndex = calls.findIndex((call) => (call[0]?.element as HTMLElement | undefined)?.dataset.testid === 'map-mover')
    expect(moverCallIndex).toBeGreaterThanOrEqual(0)
    const moverMarker = vi.mocked(maplibregl.Marker).mock.results[moverCallIndex].value
    // Dokładna wartość pochodzi z `resolveInterpolatedPosition` (osobno wyczerpująco
    // przetestowana w mapPosition.test.ts) -- tu sprawdzamy tylko, że mover realnie
    // dostał pozycję między dwoma przystankami, nie że interpolacja jest arytmetycznie poprawna.
    expect(moverMarker.setLngLat).toHaveBeenCalledWith([expect.any(Number), expect.any(Number)])
    const [lon, lat] = vi.mocked(moverMarker.setLngLat).mock.calls[0][0] as [number, number]
    expect(lat).toBeGreaterThan(52.2288207)
    expect(lat).toBeLessThan(54.355)
    expect(lon).toBeGreaterThan(18.646)
    expect(lon).toBeLessThan(21.00316)

    // Marker z glifem pociągu, a popup nazywa go „Szacowana pozycja".
    const moverElement = calls[moverCallIndex][0]?.element as HTMLElement
    // eslint-disable-next-line testing-library/no-node-access -- marker spoza drzewa RTL
    expect(moverElement.querySelector('[data-part="dot"] svg')).not.toBeNull()
    const popupTexts = vi.mocked(maplibregl.Popup).mock.results.map((result) => (result.value as { content: HTMLElement | null }).content?.textContent)
    expect(popupTexts).toContain('Szacowana pozycja')
  })

  it('does not show the estimated-position caption when there is no confirmed movement yet', async () => {
    const withCoordsNotStarted = {
      ...RESPONSE,
      trainStatus: 'S',
      stops: RESPONSE.stops.map((stop, index) => ({
        ...stop,
        isConfirmed: false,
        hasTrainStarted: false,
        lat: index === 0 ? 54.355 : 52.2288207,
        lon: index === 0 ? 18.646 : 21.00316,
      })),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(withCoordsNotStarted)))
    freezeClock('2026-08-01T05:00:00.000Z')
    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 2706" />)

    expect(await screen.findByText('Mapa trasy')).toBeInTheDocument()
    // Resolver bez pozycji: ani podpisu, ani markera (tylko 2 piny przystanków).
    expect(screen.queryByText(ESTIMATED_POSITION_CAPTION)).not.toBeInTheDocument()
    expect(screen.getByText('Brak szacowanej pozycji pociągu.')).toBeInTheDocument()
    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(2))
    expect(vi.mocked(maplibregl.Marker).mock.calls.some((call) => (call[0]?.element as HTMLElement | undefined)?.dataset.testid === 'map-mover')).toBe(false)
  })

  it('shows the estimated-position marker once past the planned departure, even with nothing confirmed (mirrors mock train 107, ruling z 2026-09-23)', async () => {
    const withCoordsNotStarted = {
      ...RESPONSE,
      trainStatus: 'S',
      stops: RESPONSE.stops.map((stop, index) => ({
        ...stop,
        isConfirmed: false,
        hasTrainStarted: false,
        lat: index === 0 ? 54.355 : 52.2288207,
        lon: index === 0 ? 18.646 : 21.00316,
      })),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(withCoordsNotStarted)))
    // stops[0].plannedDeparture = 09:00, stops[1].plannedArrival = 11:20 -- 09:30 jest w oknie,
    // po planowym odjeździe, mimo `trainStatus: 'S'` i braku jakiegokolwiek potwierdzenia
    // (isScheduleProjection nie robi wyjątku dla 'S' -- AGENTS.md ruling, handoff 2026-09-23).
    freezeClock('2026-08-01T09:30:00.000Z')
    render(<ConnectionDetails scheduleId="2026" orderId="12345" operatingDate="2026-08-01" trainLabel="EIC 2706" />)

    expect(await screen.findByText('Mapa trasy')).toBeInTheDocument()
    expect(screen.getByText(ESTIMATED_POSITION_CAPTION)).toBeInTheDocument()
    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(3))
  })
})

const ESTIMATED_POSITION_CAPTION = 'Szacowana pozycja — wg rozkładu i ostatniego potwierdzenia, nie GPS.'

describe('header, states and arrival (PR5)', () => {
  const PROPS = { scheduleId: '2026', orderId: '12345', operatingDate: '2026-08-01', trainLabel: 'EIC 1' } as const
  const trainUrls = (m: ReturnType<typeof vi.fn>) => m.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/api/train'))

  it('header shows number, carrier, relation and the operating date also when it is not today', async () => {
    freezeClock('2026-10-11T10:00:00Z') // data kursowania 01.08.2026 jest dawno za nami
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ ...RESPONSE, nationalNumber: '1602' })))

    render(<ConnectionDetails {...PROPS} />)
    await waitForRoute()

    expect(screen.getByRole('heading', { level: 1, name: 'EIC 1602' })).toBeInTheDocument()
    expect(screen.getAllByText('„PKP Intercity” Spółka Akcyjna').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'do' })).toBeInTheDocument()
    // Jedna linia daty, bez „dziś": data jest widoczna także w przeszłości, tylko raz.
    expect(screen.getAllByText(/01\.08\.2026/)).toHaveLength(1)
  })

  it('meta grid is hidden on phones (class), has "Odjazd (plan)" with the planned departure and no "Data" tile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(RESPONSE)))

    render(<ConnectionDetails {...PROPS} />)
    await waitForRoute()

    const meta = screen.getByTestId('connection-meta')
    expect(meta).toHaveClass('max-sm:hidden')
    const tiles = within(meta)
    expect(tiles.getByText('Odjazd (plan)')).toBeInTheDocument()
    // Plan 09:00, nie faktyczne 09:07 (faktyczny odjazd jest w wierszu trasy).
    expect(tiles.getByText(formatClockTime('2026-08-01T09:00:00.000Z'))).toBeInTheDocument()
    expect(tiles.queryByText(formatClockTime('2026-08-01T09:07:00.000Z'))).not.toBeInTheDocument()
    expect(tiles.queryByText('Data')).not.toBeInTheDocument()
    expect(tiles.getByText('Przyjazd (plan)')).toBeInTheDocument()
    expect(tiles.getByText('Czas podróży')).toBeInTheDocument()
  })

  describe('"Przyjazd do celu" label', () => {
    const WITH_LAST = (last: Record<string, unknown>) => ({ ...RESPONSE, stops: [RESPONSE.stops[0], { ...RESPONSE.stops[1], ...last }] })
    const arrival = () => within(screen.getByTestId('arrival-block'))
    const PLAN = formatClockTime('2026-08-01T11:20:00.000Z')

    it('confirmed arrival = "Faktycznie" with the plan underneath and a countdown', async () => {
      freezeClock('2026-08-01T10:00:00Z')
      const last = { isConfirmed: true, actualArrival: '2026-08-01T11:25:00.000Z', arrivalDelayMinutes: 5 }
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(WITH_LAST(last))))

      render(<ConnectionDetails {...PROPS} />)
      await waitForRoute()

      expect(arrival().getByText(formatClockTime('2026-08-01T11:25:00.000Z'))).toBeInTheDocument()
      expect(arrival().getByText('Faktycznie')).toBeInTheDocument()
      expect(arrival().getByText(`· Plan ${PLAN}`)).toBeInTheDocument()
      expect(arrival().getByText(/^za /)).toBeInTheDocument()
    })

    it('PKP prediction = "Przew." (abbr "Przewidywana"), plan underneath', async () => {
      freezeClock('2026-08-01T10:00:00Z')
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(WITH_LAST({ predictedArrival: '2026-08-01T11:40:00.000Z' }))))

      render(<ConnectionDetails {...PROPS} />)
      await waitForRoute()

      expect(arrival().getByText(formatClockTime('2026-08-01T11:40:00.000Z'))).toBeInTheDocument()
      expect(arrival().getByText('Przew.')).toHaveAttribute('title', 'Przewidywana')
      expect(arrival().getByText(`· Plan ${PLAN}`)).toBeInTheDocument()
      expect(arrival().queryByText('Faktycznie')).not.toBeInTheDocument()
    })

    it('no fact and no prediction = "Plan" only, never a raw unconfirmed actual', async () => {
      freezeClock('2026-08-01T10:00:00Z')
      // `actualArrival` skopiowany z planu bez potwierdzenia nie jest faktem (#2).
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(WITH_LAST({ actualArrival: '2026-08-01T11:50:00.000Z' }))))

      render(<ConnectionDetails {...PROPS} />)
      await waitForRoute()

      expect(arrival().getByText(PLAN)).toBeInTheDocument()
      expect(arrival().getByText('Plan')).toBeInTheDocument()
      expect(arrival().queryByText(/Plan \d/)).not.toBeInTheDocument()
      expect(arrival().queryByText(formatClockTime('2026-08-01T11:50:00.000Z'))).not.toBeInTheDocument()
    })

    it('cancelled destination has no countdown; unknown arrival hides the block', async () => {
      freezeClock('2026-08-01T10:00:00Z')
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(WITH_LAST({ isCancelled: true }))))

      const view = render(<ConnectionDetails {...PROPS} />)
      await waitForRoute()
      expect(arrival().queryByText(/^za /)).not.toBeInTheDocument()
      view.unmount()

      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(WITH_LAST({ plannedArrival: null }))))
      render(<ConnectionDetails {...PROPS} orderId="999" />)
      await waitForRoute()
      expect(screen.queryByTestId('arrival-block')).not.toBeInTheDocument()
    })
  })

  it('en-route estimate gets a touch-friendly caption; none without an estimate', async () => {
    freezeClock('2026-08-01T10:00:00Z')
    const caption = 'Szacunek z ostatniego potwierdzenia — może się zmienić na dalszej trasie.'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        jsonResponse({ ...RESPONSE, stops: [{ ...RESPONSE.stops[0], estimatedDelayMinutes: null }, { ...RESPONSE.stops[1], estimatedDelayMinutes: 6 }] })
      )
    )
    const view = render(<ConnectionDetails {...PROPS} />)
    await waitForRoute()
    expect(screen.getByText(caption)).toBeInTheDocument()
    view.unmount()

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ ...RESPONSE, orderId: '999' })))
    render(<ConnectionDetails {...PROPS} orderId="999" />)
    await waitForRoute()
    expect(screen.queryByText(caption)).not.toBeInTheDocument()
  })

  it('loading shows a header + axis skeleton (aria-busy, sr-only text, one h1, decorative blocks)', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})))

    render(<ConnectionDetails {...PROPS} />)

    const card = screen.getByTestId('connection-loading')
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(within(card).getByText('Wczytywanie trasy…')).toHaveClass('sr-only')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'EIC 1' })).toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-node-access -- bloki szkieletu są dekoracją bez roli
    const blocks = card.querySelectorAll('[aria-hidden="true"].animate-pulse')
    expect(blocks.length).toBeGreaterThanOrEqual(10) // relacja, status + ~4 wiersze osi (kropka + 2 paski)
  })

  describe('first-fetch error', () => {
    it('keeps the server message and offers "Spróbuj ponownie" (foreground fetch) and "Szukaj stacji" → /search', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => Promise.resolve(new Response('boom', { status: 500 })))
        .mockImplementation(() => jsonResponse(RESPONSE))
      vi.stubGlobal('fetch', fetchMock)

      render(<ConnectionDetails {...PROPS} />)

      expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się pobrać szczegółów połączenia.')
      expect(screen.getByRole('link', { name: 'Szukaj stacji' })).toHaveAttribute('href', '/search')
      fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

      await waitForRoute()
      expect(trainUrls(fetchMock)).toHaveLength(2)
      expect(new URL(trainUrls(fetchMock)[1], 'http://localhost').searchParams.has('background')).toBe(false)
    })

    it('a 500 never shows the server wording ("Błąd …" is banned in visible text): generic message, no refresh advice', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Błąd pobierania danych z PKP' }), { status: 500 }))
      )

      render(<ConnectionDetails {...PROPS} />)

      expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się pobrać szczegółów połączenia.')
      expect(screen.queryByText(/Błąd/)).not.toBeInTheDocument()
      expect(screen.getByText('Ten widok nie ma zapisanej wcześniejszej wersji.')).toBeInTheDocument()
      expect(screen.queryByText(/odświeżyć stronę/)).not.toBeInTheDocument()
    })

    it.each([
      [404, 'Nie znaleziono połączenia'],
      [503, 'Chwilowo zbyt wiele zapytań o szczegóły połączeń. Spróbuj ponownie za kilka minut.'],
    ])('%i keeps the server message and gets the same two actions', async (status, message) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: message }), { status })))

      render(<ConnectionDetails {...PROPS} />)

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.queryByText(/Spróbuj odświeżyć stronę/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Szukaj stacji' })).toHaveAttribute('href', '/search')
    })
  })

  it('empty stops is not a finished journey: message, no age line, no retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ ...RESPONSE, stops: [] })))

    render(<ConnectionDetails {...PROPS} />)

    expect(await screen.findByRole('status')).toHaveTextContent('PKP nie udostępnia teraz trasy tego połączenia.')
    expect(screen.queryByTestId('data-age')).not.toBeInTheDocument()
    // Jak wczytywanie i błąd: jeden h1 z etykiety linku, a nie pusta strona bez tytułu.
    expect(screen.getByRole('heading', { level: 1, name: 'EIC 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Szukaj stacji' })).toHaveAttribute('href', '/search')
  })
})
