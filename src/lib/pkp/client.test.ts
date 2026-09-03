import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveClient, PkpApiError } from './client'
import { jsonResponse } from '@/test-utils/http'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createLiveClient', () => {
  it('sends the X-API-Key header and fetches the full station list once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ stations: [{ id: '5100', name: 'Warszawa Centralna' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const results = await client.searchStations('Warszawa')

    expect(results).toEqual([{ id: '5100', name: 'Warszawa Centralna' }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/v1/dictionaries/stations?pageSize=10000')
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('secret-key')
  })

  it('filters by substring anywhere in the name, not just the start', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        stations: [
          { id: '1', name: 'Warszawa Centralna' },
          { id: '2', name: 'Nowa Warszawa' },
          { id: '3', name: 'Kraków Główny' },
        ],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const results = await client.searchStations('warszawa')

    expect(results.map((station) => station.name)).toEqual(['Warszawa Centralna', 'Nowa Warszawa'])
  })

  it('fetches the station list only once across multiple searches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ stations: [{ id: '1', name: 'Warszawa Centralna' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.searchStations('warszawa')
    await client.searchStations('kraków')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('drops stations with a null name (the API documents the field as nullable)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ stations: [{ id: '1', name: 'Warszawa Centralna' }, { id: '2', name: null }] })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const results = await client.searchStations('')

    expect(results).toEqual([{ id: '1', name: 'Warszawa Centralna' }])
  })

  // Sufity limitu przychodzą z tych samych odpowiedzi co pozostałe (sprawdzone
  // na żywym API: `X-RateLimit-Hourly-Limit: 100`, `X-RateLimit-Daily-Limit: 1000`),
  // więc panel diagnostyczny nie musi ich nigdzie wpisywać na sztywno.
  it('reads the rate-limit ceilings from response headers too, not just what is left', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { trains: [] },
        {
          'X-RateLimit-Hourly-Remaining': '62',
          'X-RateLimit-Daily-Remaining': '702',
          'X-RateLimit-Hourly-Limit': '100',
          'X-RateLimit-Daily-Limit': '1000',
        }
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = createLiveClient('secret-key')

    const result = await client.getOperations(['33605'])

    expect(result.budget).toEqual({ hourly: 62, daily: 702, hourlyLimit: 100, dailyLimit: 1000 })
  })

  it('reads the rate-limit budget from response headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { trains: [] },
        { 'X-RateLimit-Hourly-Remaining': '42', 'X-RateLimit-Daily-Remaining': '901' }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const result = await client.getOperations(['5100'])

    expect(result.budget).toEqual({ hourly: 42, daily: 901, hourlyLimit: null, dailyLimit: null })
  })

  it('reports an absent rate-limit header as unknown, not as an exhausted budget', async () => {
    // Regresja: Number(null ?? '0') dawało 0, więc API bez tych nagłówków
    // wyglądało jak wyczerpany limit i poller zwalniał do 5 minut na stałe.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ trains: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const result = await client.getOperations(['5100'])

    expect(result.budget).toEqual({ hourly: null, daily: null, hourlyLimit: null, dailyLimit: null })
  })

  it('reports an unparsable rate-limit header as unknown', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ trains: [] }, { 'X-RateLimit-Hourly-Remaining': 'brak', 'X-RateLimit-Daily-Remaining': '  ' })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const result = await client.getOperations(['5100'])

    expect(result.budget).toEqual({ hourly: null, daily: null, hourlyLimit: null, dailyLimit: null })
  })

  it('still reports a genuine zero as zero', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ trains: [] }, { 'X-RateLimit-Hourly-Remaining': '0', 'X-RateLimit-Daily-Remaining': '0' })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const result = await client.getOperations(['5100'])

    expect(result.budget).toEqual({ hourly: 0, daily: 0, hourlyLimit: null, dailyLimit: null })
  })

  it('joins multiple station ids into one query and requests withPlanned=true, without fullRoutes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ trains: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getOperations(['5100', '5136'])

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('stations=5100,5136')
    expect(String(url)).toContain('withPlanned=true')
    // fullRoutes=true dokładał pełną trasę (śr. 15 przystanków) do każdego
    // z ~1500 pociągów mimo że używany był tylko jeden przystanek — 8.6 MB
    // zamiast 680 KB co cykl pollera (zmierzone na żywo, Warszawa Centralna).
    // Origin/destination („Kierunek") teraz z dopasowanej trasy /schedules
    // (fullRoute=true tam, ale cache 24h — koszt jednorazowy, nie co 90s).
    expect(new URL(String(url)).searchParams.has('fullRoutes')).toBe(false)
  })

  it('returns the parsed trains list and station name dictionary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        trains: [{ scheduleId: 25, orderId: 1, stations: [{ stationId: 5100, plannedDeparture: '2026-08-01T12:15:00+02:00' }] }],
        stations: { '5100': 'Warszawa Centralna' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const result = await client.getOperations(['5100'])

    expect(result.trains).toHaveLength(1)
    expect(result.trains[0].scheduleId).toBe('25')
    expect(result.stationNames).toEqual({ '5100': 'Warszawa Centralna' })
    expect(result.truncated).toBe(false)
  })

  it('flags the response as truncated when the API reports another page', async () => {
    // Klient nie dociąga strony 2 (koszt z limitu 100/h) -- zwraca `truncated`,
    // a poller decyduje, czy dla obserwowanych stacji potrzebne jest węższe
    // zapytanie. Sam brak `pagination` albo `hasNextPage: false` -> `false`.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ trains: [], pagination: { totalCount: 8603, hasNextPage: true } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const result = await client.getOperations(['33605'])

    expect(result.truncated).toBe(true)
  })

  it('requests a specific page when asked, so the poller can paginate a truncated set', async () => {
    // Poller sam dociąga kolejne strony /operations (bramka budżetowa +
    // limit stron), więc klient musi umieć poprosić o stronę > 1. `page`
    // jest w swaggerze (patrz contract.test.ts), domyślnie 1.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ trains: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getOperations(['5100'], 3)

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('page')).toBe('3')
  })

  it('defaults to page 1 when no page is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ trains: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getOperations(['5100'])

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('page')).toBe('1')
  })

  it('throws PkpApiError with the response status on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('bad-key')
    await expect(client.getOperations(['5100'])).rejects.toMatchObject({ status: 401 })
    await expect(client.getOperations(['5100'])).rejects.toBeInstanceOf(PkpApiError)
  })

  it('waits with jitter before retrying once on a 5xx, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ trains: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const client = createLiveClient('secret-key', () => new Date(), sleep, () => 0.5)
    const result = await client.getOperations(['5100'])

    expect(result.trains).toEqual([])
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(1000) // 500 bazy + 0.5 * 1000 jittera
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('waits with jitter before retrying once on a PKP timeout (AbortError), not just a 5xx', async () => {
    // Zaobserwowane na żywo (staging): PKP bywa chwilowo wolne i przekracza
    // 8s timeout (fetchWithTimeout) -- to samo przejściowe zjawisko co 5xx,
    // ale wcześniej w ogóle nie było ponawiane, więc chwilowe spowolnienie
    // od razu kończyło się twardą awarią (500 z /api/train) bez żadnej próby.
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'))
      .mockResolvedValueOnce(jsonResponse({ trains: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const client = createLiveClient('secret-key', () => new Date(), sleep, () => 0.5)
    const result = await client.getOperations(['5100'])

    expect(result.trains).toEqual([])
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 4xx that is not worth repeating', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const client = createLiveClient('secret-key', () => new Date(), sleep)
    await expect(client.getOperations(['5100'])).rejects.toMatchObject({ status: 400 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('gives every PKP endpoint the same retry resilience, not just getOperations', async () => {
    // Wcześniej ponowienie żyło tylko wokół getOperations w pollerze --
    // getTrainDetail (wołane z /api/train) nie miało żadnego. Teraz to
    // wspólny wrapper w fetchJsonWithRetry, więc getTrainDetail też korzysta.
    // Kolejność wywołań fetch jest deterministyczna: operationUrl i routeUrl
    // odpalają się synchronicznie w tej kolejności (Promise.allSettled), więc
    // ewentualne ponowienie operationUrl trafia dopiero jako trzecie wywołanie.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 503 })) // 1: operationUrl, pierwsza próba
      .mockResolvedValueOnce(new Response('not found', { status: 404 })) // 2: routeUrl (brak trasy to normalny przypadek, bez retry)
      .mockResolvedValueOnce(
        jsonResponse({ scheduleId: '2026', orderId: '1', trainOrderId: null, operatingDate: '2026-08-01', trainStatus: 'P', stations: [] })
      ) // 3: operationUrl, ponowienie
      .mockResolvedValue(jsonResponse({ stations: [] })) // 4+: słownik stacji (fetchAllStations)
    vi.stubGlobal('fetch', fetchMock)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const client = createLiveClient('secret-key', () => new Date(), sleep, () => 0)
    const detail = await client.getTrainDetail('2026', '1', '2026-08-01')

    expect(detail.operation.scheduleId).toBe('2026')
    expect(detail.route).toBeNull()
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('fetches routes for the requested stations and parses carrier/category', async () => {
    // Trasa z przystankiem, bo tak wygląda działająca odpowiedź `fullRoute=true`.
    // Trasa BEZ przystanków to sygnał awarii PKP i uruchamia ponowienie bez
    // `fullRoute` (patrz osobny test niżej) -- nie chcemy go tutaj przypadkiem.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        routes: [
          {
            scheduleId: 25,
            orderId: 118845,
            carrierCode: 'PKP_IC',
            commercialCategorySymbol: 'EIC',
            stations: [{ stationId: 5100 }],
          },
        ],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const { routes } = await client.getSchedules(['5100', '5136'])

    expect(routes).toEqual([
      {
        scheduleId: '25',
        orderId: '118845',
        trainOrderId: null,
        carrierCode: 'PKP_IC',
        commercialCategorySymbol: 'EIC',
        name: null,
        nationalNumber: null,
        operatingDates: [],
        stations: [
          {
            stationId: '5100',
            arrivalPlatform: null,
            arrivalTrack: null,
            departurePlatform: null,
            departureTrack: null,
            arrivalTime: null,
            departureTime: null,
            arrivalDay: null,
            departureDay: null,
            stopTypeName: null,
          },
        ],
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/v1/schedules?stations=5100,5136')
  })

  it('ponawia /schedules bez fullRoute, gdy PKP zwraca trasy z pustą listą przystanków', async () => {
    // Awaria stwierdzona na żywym API 2026-08-30: `fullRoute=true` zwracało
    // 10 498 tras (2,5 MB), wszystkie bez `stations` -- czyli bez godzin, peronu
    // i kierunku. Wariant bez `fullRoute` działał i niósł przystanek pytanej
    // stacji. Schemat tego nie zgłasza, bo `stations` jest `.nullish()`.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ routes: [{ scheduleId: 2026, orderId: 1, carrierCode: 'KM' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          routes: [{ scheduleId: 2026, orderId: 1, carrierCode: 'KM', stations: [{ stationId: 5100, departureTime: '12:05:00' }] }],
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const { routes } = await client.getSchedules(['5100'])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('fullRoute=true')
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('fullRoute')
    // Liczy się wynik: przystanek z godziną, z którego da się zbudować tablicę.
    expect(routes[0].stations).toHaveLength(1)
    expect(routes[0].stations[0].departureTime).toBe('12:05:00')
  })

  it('nie ponawia, gdy trasy mają przystanki -- fallback jest wyłącznie na awarię', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ routes: [{ scheduleId: 2026, orderId: 1, stations: [{ stationId: 5100 }] }] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getSchedules(['5100'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rozroznia okno dat w kluczu cache rozkladu -- inny dzien to inne pobranie', async () => {
    // Klucz zawierał wyłącznie zestaw stacji, a okno `dateFrom`/`dateTo` liczone
    // jest w chwili pobrania. Przy TTL 24 h znaczyło to, że rozkład pobrany
    // o 14:00 (okno dziś+jutro) obsługiwał także zapytania z DNIA NASTĘPNEGO aż
    // do 14:00 — czyli przez kilkanaście godzin aplikacja pracowałaby na oknie,
    // które nie zawiera dnia bieżącego.
    // mockImplementation, nie mockResolvedValue: ten test celowo pobiera DWA
    // razy, a jeden obiekt Response da się odczytać tylko raz.
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse({ routes: [{ scheduleId: 2026, orderId: 1, stations: [{ stationId: 5100 }] }] }))
    vi.stubGlobal('fetch', fetchMock)

    let clock = new Date('2026-08-30T12:00:00+02:00')
    const client = createLiveClient('secret-key', () => clock)

    await client.getSchedules(['5100'])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    clock = new Date('2026-08-31T00:30:00+02:00')
    await client.getSchedules(['5100'])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('dateFrom=2026-08-30')
    expect(String(fetchMock.mock.calls[1][0])).toContain('dateFrom=2026-08-31')
  })

  it('nadal trafia w cache przy powtorzeniu tego samego dnia', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ routes: [{ scheduleId: 2026, orderId: 1, stations: [{ stationId: 5100 }] }] }))
    vi.stubGlobal('fetch', fetchMock)

    const clock = new Date('2026-08-30T12:00:00+02:00')
    const client = createLiveClient('secret-key', () => clock)

    await client.getSchedules(['5100'])
    await client.getSchedules(['5100'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('nie ponawia, gdy PKP nie zwróciło żadnej trasy -- pusto to nie to samo co zepsuto', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ routes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getSchedules(['5100'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('requests full routes from /schedules, so origin/destination for "Kierunek" are available without fullRoutes on /operations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ routes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getSchedules(['5100'])

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('fullRoute=true')
  })

  it('bundles dictionaries.stations from the schedules response as stationNames, without an extra request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        routes: [],
        dictionaries: { stations: { '109': { id: 109, name: 'Szczecin Port Centralny' } } },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const { stationNames } = await client.getSchedules(['5100'])

    expect(stationNames).toEqual({ '109': 'Szczecin Port Centralny' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('bundles dictionaries.carriers from the schedules response as carrierNames, without an extra request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        routes: [],
        dictionaries: { carriers: { PR: 'POLREGIO S.A.' } },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const { carrierNames } = await client.getSchedules(['5100'])

    expect(carrierNames).toEqual({ PR: 'POLREGIO S.A.' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('caches schedules per station set regardless of id order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ routes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getSchedules(['5100', '5136'])
    await client.getSchedules(['5136', '5100'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refetches schedules for a different station set', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ routes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getSchedules(['5100'])
    await client.getSchedules(['4900'])

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('encodes station ids so they cannot inject extra query parameters', async () => {
    // Identyfikatory pochodzą z parametru URL /api/board, czyli spoza aplikacji.
    // Wklejone surowo do zapytania pozwalałyby dopisać własne parametry do
    // żądania kierowanego do PKP (np. podbić pageSize albo wyłączyć withPlanned).
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ trains: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    // Ładunek celowo RÓŻNY od naszego własnego pageSize (5000) -- inaczej test
    // przechodziłby na remis i niczego by nie dowodził.
    await client.getOperations(['5100&pageSize=1'])

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('pageSize')).toBe('5000')
    expect(url.searchParams.get('stations')).toBe('5100&pageSize=1')
    expect(url.searchParams.get('withPlanned')).toBe('true')
  })

  it('encodes a fragment marker instead of letting it truncate the query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ trains: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getOperations(['5100#'])

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.hash).toBe('')
  })

  it('encodes station ids on the schedules endpoint too', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ routes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getSchedules(['4900&foo=bar'])

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('foo')).toBeNull()
    expect(url.searchParams.get('stations')).toBe('4900&foo=bar')
  })

  it('requests both today and tomorrow (Warsaw calendar date) so a train departing just after midnight still gets a matching route', async () => {
    // /schedules domyślnie zwraca tylko dzisiejsze kursy — pociąg odjeżdżający
    // tuż po północy formalnie kursuje "jutro" i bez tego okna dat nie miałby
    // dopasowanej trasy (pusta nazwa, przewoźnik, peron/tor), mimo że
    // /operations już go pokazuje w widoku 2h naprzód. Ten dokładny przypadek
    // trafił na produkcję.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ routes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key', () => new Date('2026-08-01T23:50:00+02:00'))
    await client.getSchedules(['5100'])

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('dateFrom')).toBe('2026-08-01')
    expect(url.searchParams.get('dateTo')).toBe('2026-08-02')
  })

  it('computes the date window from the Warsaw calendar date, not the process timezone, even mid-afternoon', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ routes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key', () => new Date('2026-01-15T10:00:00Z'))
    await client.getSchedules(['5100'])

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('dateFrom')).toBe('2026-01-15')
    expect(url.searchParams.get('dateTo')).toBe('2026-01-16')
  })

  it('aborts a request that hangs past the timeout instead of waiting forever, retries once, then gives up if it hangs again too', async () => {
    // Timeout 8 s jest udokumentowanym zachowaniem, ale nie mial testu. Bez niego
    // zawieszone polaczenie blokowaloby przebieg pollera bez konca. Ponowienie
    // po AbortError (patrz test wyżej) oznacza, że trwale zawieszone połączenie
    // musi zawiesić się DWA razy (obie próby), zanim błąd faktycznie wypłynie.
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          })
      )
      vi.stubGlobal('fetch', fetchMock)
      const sleep = vi.fn().mockResolvedValue(undefined)

      const client = createLiveClient('secret-key', () => new Date(), sleep, () => 0)
      const pending = client.getOperations(['5100'])
      const assertion = expect(pending).rejects.toThrowError(/abort/i)

      await vi.advanceTimersByTimeAsync(8000) // pierwsza próba wisi i się poddaje
      await vi.advanceTimersByTimeAsync(500) // odstęp przed ponowieniem (baza, bez jittera przy random()=0)
      await vi.advanceTimersByTimeAsync(8000) // druga próba też wisi i się poddaje
      await assertion

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [, secondInit] = fetchMock.mock.calls[1]
      expect(secondInit.signal.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a response whose shape does not match the schema', async () => {
    // Blad walidacji ma dotrzec do pollera, zeby ten zachowal poprzedni snapshot
    // zamiast nadpisac go smieciami.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ trains: [{ brakWymaganychPol: true }] })))

    const client = createLiveClient('secret-key')

    await expect(client.getOperations(['5100'])).rejects.toThrow()
  })

  it('fetches the station dictionary once even when requests arrive together', async () => {
    // Cache sprawdzany jest przed await, a zapisywany po nim. Rownolegle zadania
    // (a tak wlasnie wyglada odswiezenie kilku kart naraz albo zimny start)
    // trafiaja wszystkie w pusty cache i kazde odpala wlasne pobranie slownika,
    // zuzywajac po jednym zapytaniu z limitu zamiast jednego lacznie.
    let inFlight = 0
    let maxInFlight = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return jsonResponse({ stations: [{ id: '5100', name: 'Warszawa Centralna' }] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await Promise.all(Array.from({ length: 8 }, () => client.searchStations('warszawa')))

    expect(maxInFlight).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fetches a schedules set once even when requests arrive together', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return jsonResponse({ routes: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await Promise.all(Array.from({ length: 8 }, () => client.getSchedules(['5100', '5136'])))

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not let the schedules cache grow without bound', async () => {
    // Klucz to zestaw obserwowanych stacji, więc każda zmiana ulubionych
    // dokładała wpis, którego nic nigdy nie usuwało.
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ routes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    for (let i = 0; i < 200; i += 1) {
      await client.getSchedules([`stacja-${i}`])
    }
    expect(fetchMock).toHaveBeenCalledTimes(200)

    // Najstarsze zestawy zostały wyeksmitowane, więc trzeba je pobrać ponownie...
    await client.getSchedules(['stacja-0'])
    expect(fetchMock).toHaveBeenCalledTimes(201)

    // ...a najświeższe wciąż siedzą w cache'u.
    await client.getSchedules(['stacja-199'])
    expect(fetchMock).toHaveBeenCalledTimes(201)
  })

  describe('getTrainDetail', () => {
    function stubTrainDetailFetch(overrides: {
      operation?: () => Promise<Response>
      route?: () => Promise<Response>
      stations?: () => Promise<Response>
    }) {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        const href = String(url)
        if (href.includes('/operations/train/')) {
          return (
            overrides.operation?.() ??
            jsonResponse({
              scheduleId: 2026,
              orderId: 12345,
              operatingDate: '2026-08-01',
              trainStatus: 'P',
              stations: [{ stationId: 33605, plannedDeparture: '2026-08-01T12:00:00+02:00' }],
            })
          )
        }
        if (href.includes('/schedules/route/')) {
          return (
            overrides.route?.() ??
            jsonResponse({
              scheduleId: 2026,
              orderId: 12345,
              carrierCode: 'IC',
              commercialCategorySymbol: 'EIC',
              stations: [{ stationId: 33605, departurePlatform: '4' }],
            })
          )
        }
        // /dictionaries/stations — słownik nazw dla stopStationNames
        return (
          overrides.stations?.() ??
          jsonResponse({ stations: [{ id: 33605, name: 'Warszawa Centralna' }] })
        )
      })
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    it('fetches the realized operation, the scheduled route, and the station name dictionary, merging into one result', async () => {
      const fetchMock = stubTrainDetailFetch({})

      const client = createLiveClient('secret-key')
      const result = await client.getTrainDetail('2026', '12345', '2026-08-01')

      expect(result.operation.scheduleId).toBe('2026')
      expect(result.operation.stations).toHaveLength(1)
      expect(result.route).toEqual({
        scheduleId: '2026',
        orderId: '12345',
        trainOrderId: null,
        carrierCode: 'IC',
        commercialCategorySymbol: 'EIC',
        name: null,
        nationalNumber: null,
        operatingDates: [],
        stations: [
          {
            stationId: '33605',
            arrivalPlatform: null,
            arrivalTrack: null,
            departurePlatform: '4',
            departureTrack: null,
            arrivalTime: null,
            departureTime: null,
            arrivalDay: null,
            departureDay: null,
            stopTypeName: null,
          },
        ],
      })
      expect(result.stationNames).toEqual({ '33605': 'Warszawa Centralna' })

      const operationUrl = fetchMock.mock.calls.find(([url]) => String(url).includes('/operations/train/'))?.[0]
      const routeUrl = fetchMock.mock.calls.find(([url]) => String(url).includes('/schedules/route/'))?.[0]
      expect(String(operationUrl)).toContain('/api/v1/operations/train/2026/12345/2026-08-01')
      expect(String(routeUrl)).toContain('/api/v1/schedules/route/2026/12345')
    })

    it('returns a null route (not an error) when no scheduled route matches the operation', async () => {
      // Mniejszość pociągów nie ma dopasowanej trasy (patrz README, "Znane
      // ograniczenia") — realizacja i tak musi się pokazać, tylko bez peronu/toru.
      stubTrainDetailFetch({ route: () => Promise.resolve(new Response('not found', { status: 404 })) })

      const client = createLiveClient('secret-key')
      const result = await client.getTrainDetail('2026', '12345', '2026-08-01')

      expect(result.route).toBeNull()
    })

    it('propagates a failure to fetch the realization, even when the route succeeds', async () => {
      stubTrainDetailFetch({ operation: () => Promise.resolve(new Response('not found', { status: 404 })) })

      const client = createLiveClient('secret-key')

      await expect(client.getTrainDetail('2026', '12345', '2026-08-01')).rejects.toMatchObject({ status: 404 })
    })

    it('encodes the path segments so they cannot inject extra path/query into the PKP request', async () => {
      const fetchMock = stubTrainDetailFetch({})

      const client = createLiveClient('secret-key')
      await client.getTrainDetail('2026', '1', '2026-08-01/../../secrets')

      const operationUrl = fetchMock.mock.calls.find(([url]) => String(url).includes('/operations/train/'))?.[0]
      expect(String(operationUrl)).not.toContain('/../')
      expect(String(operationUrl)).toContain(encodeURIComponent('2026-08-01/../../secrets'))
    })
  })

  describe('getNameDictionaries', () => {
    function stubDictionaryFetch(): ReturnType<typeof vi.fn> {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/dictionaries/carriers')) {
          return jsonResponse({ carriers: [{ code: 'IC', name: 'PKP Intercity' }] })
        }
        if (String(url).includes('/dictionaries/commercial-categories')) {
          return jsonResponse({ commercialCategories: [{ code: 'EIC', name: 'Express InterCity', carrierCode: 'IC' }] })
        }
        throw new Error(`unexpected URL in test: ${url}`)
      })
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    it('fetches both public dictionaries without the X-API-Key header', async () => {
      // Weryfikowane na żywo (docs/pkp-api-slowniki-statusy.md #1): wysłanie
      // klucza na te endpointy mimo że są publiczne przełącza żądanie z
      // darmowej puli limitów na tę samą pulę 100/h co /operations.
      const fetchMock = stubDictionaryFetch()

      const client = createLiveClient('secret-key')
      await client.getNameDictionaries()

      expect(fetchMock).toHaveBeenCalledTimes(2)
      for (const [url, init] of fetchMock.mock.calls) {
        expect(String(url)).toMatch(/\/dictionaries\/(carriers|commercial-categories)$/)
        expect(init.headers).toEqual({})
      }
    })

    it('builds carrierNames and categoryNames (keyed by carrierCode|code) from the two responses', async () => {
      stubDictionaryFetch()

      const client = createLiveClient('secret-key')
      const result = await client.getNameDictionaries()

      expect(result).toEqual({
        carrierNames: { IC: 'PKP Intercity' },
        categoryNames: { 'IC|EIC': 'Express InterCity' },
      })
    })

    it('fetches the dictionaries only once across multiple calls', async () => {
      const fetchMock = stubDictionaryFetch()

      const client = createLiveClient('secret-key')
      await client.getNameDictionaries()
      await client.getNameDictionaries()

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('widżet stanu sieci', () => {
    it('getOperationsStatistics parses the nationwide status counters', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({
          generatedAt: '2026-08-26T19:53:29Z',
          totalTrains: 7256,
          notStarted: 1690,
          inProgress: 723,
          completed: 4803,
          cancelled: 15,
          partialCancelled: 25,
        })
      )
      vi.stubGlobal('fetch', fetchMock)

      const client = createLiveClient('secret-key')
      const result = await client.getOperationsStatistics('2026-08-26')

      expect(result.totalTrains).toBe(7256)
      expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/operations/statistics?date=2026-08-26')
    })

    it('getDailyCarrierCounts groups routes by carrier code, ignoring unknown codes', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({
          routes: [{ carrierCode: 'IC' }, { carrierCode: 'IC' }, { carrierCode: 'KM' }, { carrierCode: null }],
        })
      )
      vi.stubGlobal('fetch', fetchMock)

      const client = createLiveClient('secret-key')
      const counts = await client.getDailyCarrierCounts('2026-08-26')

      expect(counts).toEqual({ IC: 2, KM: 1 })
      expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/schedules/routes/2026-08-26')
    })

    it('getDisruptionCount returns only the count, without a station filter', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ disruptions: [{}, {}, {}] }))
      vi.stubGlobal('fetch', fetchMock)

      const client = createLiveClient('secret-key')
      const count = await client.getDisruptionCount('2026-08-26', '2026-08-26')

      expect(count).toBe(3)
      expect(String(fetchMock.mock.calls[0][0])).not.toContain('stations=')
    })
  })

  describe('getDisruptions', () => {
    it('requests disruptions for the given stations with dictionaries always included', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({
          disruptions: [{ disruptionId: 1, message: 'utr_40', affectedRoutes: [] }],
          disruptionTypes: { utr_40: 'Awaria sieci trakcyjnej' },
        })
      )
      vi.stubGlobal('fetch', fetchMock)

      const client = createLiveClient('secret-key', () => new Date('2026-08-26T10:00:00+02:00'))
      const result = await client.getDisruptions(['33605', '80416'])

      const url = new URL(String(fetchMock.mock.calls[0][0]))
      expect(url.searchParams.get('stations')).toBe('33605,80416')
      expect(url.searchParams.get('dictionaries')).toBe('true')
      expect(result.disruptions).toEqual([{ disruptionId: 1, message: 'utr_40', affectedRoutes: [] }])
      expect(result.disruptionTypes).toEqual({ utr_40: 'Awaria sieci trakcyjnej' })
    })

    it('defaults to today and tomorrow (Warsaw calendar), same window as /schedules, when no dates are given', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ disruptions: [], disruptionTypes: {} }))
      vi.stubGlobal('fetch', fetchMock)

      const client = createLiveClient('secret-key', () => new Date('2026-08-26T10:00:00+02:00'))
      await client.getDisruptions(['33605'])

      const url = new URL(String(fetchMock.mock.calls[0][0]))
      expect(url.searchParams.get('dateFrom')).toBe('2026-08-26')
      expect(url.searchParams.get('dateTo')).toBe('2026-08-27')
    })

    it('uses an explicit dateFrom/dateTo instead of the default window (used by /api/train for one operatingDate)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ disruptions: [], disruptionTypes: {} }))
      vi.stubGlobal('fetch', fetchMock)

      const client = createLiveClient('secret-key')
      await client.getDisruptions(['33605'], '2026-08-01', '2026-08-01')

      const url = new URL(String(fetchMock.mock.calls[0][0]))
      expect(url.searchParams.get('dateFrom')).toBe('2026-08-01')
      expect(url.searchParams.get('dateTo')).toBe('2026-08-01')
    })

    it('encodes station ids so they cannot inject extra query parameters', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ disruptions: [], disruptionTypes: {} }))
      vi.stubGlobal('fetch', fetchMock)

      const client = createLiveClient('secret-key')
      await client.getDisruptions(['5100&pageSize=5000'])

      const url = new URL(String(fetchMock.mock.calls[0][0]))
      expect(url.searchParams.get('pageSize')).toBeNull()
      expect(url.searchParams.get('stations')).toBe('5100&pageSize=5000')
    })

    it('caches disruptions per station set and date window regardless of station id order', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ disruptions: [], disruptionTypes: {} }))
      vi.stubGlobal('fetch', fetchMock)

      const client = createLiveClient('secret-key')
      await client.getDisruptions(['33605', '80416'])
      await client.getDisruptions(['80416', '33605'])

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('refetches after the 15-minute cache expires', async () => {
      vi.useFakeTimers()
      try {
        const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ disruptions: [], disruptionTypes: {} }))
        vi.stubGlobal('fetch', fetchMock)

        // now() celowo stałe, niezależne od zegara fake-timerów, którym
        // podlega cache -- inaczej przesunięcie o 15 min mogłoby przekroczyć
        // północ i zmienić dateFrom/dateTo (czyli klucz cache'u), fałszując
        // test samego TTL.
        const client = createLiveClient('secret-key', () => new Date('2026-08-26T10:00:00+02:00'))
        await client.getDisruptions(['33605'])
        await vi.advanceTimersByTimeAsync(15 * 60 * 1000 - 1)
        await client.getDisruptions(['33605'])
        expect(fetchMock).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(2)
        await client.getDisruptions(['33605'])
        expect(fetchMock).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('fetches a disruptions set once even when requests arrive together', async () => {
      const fetchMock = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return jsonResponse({ disruptions: [], disruptionTypes: {} })
      })
      vi.stubGlobal('fetch', fetchMock)

      const client = createLiveClient('secret-key')
      await Promise.all(Array.from({ length: 8 }, () => client.getDisruptions(['33605'])))

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})
