// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CityPage from './page'
import { __resetCityContext } from '@/hooks/useCityContext'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'

const push = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
let cityParam = 'warszawa'
let search = ''
vi.mock('next/navigation', () => ({
  useParams: () => ({ city: cityParam }),
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => `/city/${cityParam}`,
  notFound: () => notFound(),
}))
// Stabilna referencja — świeży obiekt co render zapętliłby useSnapshotNow.
const { mockBoard, mockTransit } = vi.hoisted(() => ({
  mockBoard: { data: null, error: null },
  mockTransit: {
    data: {
      city: 'warszawa',
      schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null },
      stops: [
        {
          stopId: '7014M',
          name: 'Świętokrzyska',
          modes: ['metro'],
          lines: [{ routeId: 'M1', line: 'M1', mode: 'metro' }],
          summary: { lineCount: 1, departuresToday: 40, firstDepartureSec: 18000, lastDepartureSec: 90000, hourly: new Array(24).fill(1) },
          alerts: [],
          departures: [],
        },
      ],
      attribution: ['ZTM'],
    },
    error: null,
  },
}))
vi.mock('@/hooks/useBoard', () => ({ useBoard: () => mockBoard }))
vi.mock('@/hooks/useTransitBoard', () => ({ useTransitBoard: () => mockTransit }))

function citiesResponse() {
  return jsonResponse({
    cities: [
      {
        id: 'warszawa',
        name: 'Warszawa',
        hasTransit: true,
        railStations: [{ id: '33605', name: 'Warszawa Centralna' }],
        schedule: { state: 'ready', ageMs: 60000, feedVersion: 'mock-1', serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'] },
        lineCounts: { metro: 2, tram: 20, bus: 100, rail: 3, other: 0 },
        stopGroupCount: 1200,
      },
    ],
  })
}

beforeEach(() => {
  push.mockClear()
  cityParam = 'warszawa'
  search = ''
  window.localStorage.clear()
  __resetCityContext()
  resetCitiesCacheForTests()
  vi.stubGlobal('fetch', vi.fn(() => citiesResponse()))
})
afterEach(() => vi.unstubAllGlobals())

describe('CityPage', () => {
  it('shows the city picker, the stat tiles and one unified search', async () => {
    render(<CityPage />)
    expect(await screen.findByRole('combobox', { name: /szukaj/i })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Warszawa' })).toBeInTheDocument()
    expect(await screen.findByText('stacje kolejowe')).toBeInTheDocument()
  })

  it('navigates with ?station= when a rail result is picked, ?stop= for a transit result', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.startsWith('/api/search')
          ? jsonResponse({
              stations: [
                { id: '33605', name: 'Warszawa Centralna', kind: 'rail', mode: 'rail' },
                { id: '7014M', name: 'Świętokrzyska', kind: 'transit', mode: 'metro', modes: ['metro'], lines: [{ routeId: 'M1', line: 'M1', mode: 'metro' }] },
              ],
            })
          : citiesResponse()
      )
    )
    render(<CityPage />)
    await user.type(await screen.findByRole('combobox', { name: /szukaj/i }), 'war')
    await user.click(await screen.findByRole('option', { name: 'Warszawa Centralna' }))
    expect(push).toHaveBeenCalledWith('/city/warszawa?station=33605&name=Warszawa%20Centralna')
  })

  it('embeds the transit stop detail when ?stop= is set', () => {
    search = 'stop=7014M&name=%C5%9Awi%C4%99tokrzyska'
    render(<CityPage />)
    // useTransitBoard jest zmockowany synchronicznie — panel renderuje się od razu.
    expect(screen.getByRole('heading', { name: 'Świętokrzyska' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /wróć do wyszukiwania/i })).toBeInTheDocument()
    // Nigdy „na czas" / „opóźnienie" na stronie miejskiej.
    expect(screen.queryByText(/na czas|opóźni/i)).not.toBeInTheDocument()
  })

  it('calls notFound for a malformed city id', () => {
    cityParam = 'a/b'
    expect(() => render(<CityPage />)).toThrow('NEXT_NOT_FOUND')
  })

  // cities fetch failed → tile shows — : bez entry (`/api/cities` zawiodło) stary
  // kod liczył `entry?.railStations.length ?? 0` -- kłamliwe "0 stacji", nie
  // "nie wiadomo" (AGENTS.md #7).
  it('cities fetch failed → tile shows —', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.startsWith('/api/cities') ? Promise.reject(new Error('down')) : jsonResponse({ city: 'warszawa', state: 'loading', stats: null })
      )
    )
    render(<CityPage />)
    const label = await screen.findByText('stacje kolejowe')
    expect(label.parentElement?.textContent).toBe('—stacje kolejowe')
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  // dictionary failure → railStationsUnknown : `/api/cities` odpowiada (200),
  // ale dla tego miasta wyszukanie stacji zawiodło -- `railStations: []` +
  // `railStationsUnknown: true`. Liczba stacji ma pozostać "nieznana" ("—"),
  // nie "0 stacji".
  it('railStationsUnknown → tile shows — (not 0)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.startsWith('/api/cities')
          ? jsonResponse({
              cities: [
                {
                  id: 'warszawa',
                  name: 'Warszawa',
                  hasTransit: true,
                  railStations: [],
                  railStationsUnknown: true,
                  schedule: { state: 'ready', ageMs: 60000, feedVersion: 'mock-1', serviceDates: ['2026-09-01'] },
                  lineCounts: { metro: 2, tram: 20, bus: 100, rail: 3, other: 0 },
                  stopGroupCount: 1200,
                },
              ],
            })
          : jsonResponse({ city: 'warszawa', state: 'loading', stats: null })
      )
    )
    render(<CityPage />)
    const label = await screen.findByText('stacje kolejowe')
    expect(label.parentElement?.textContent).toBe('—stacje kolejowe')
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('with a selection: one h1 (the TopBar\'s) and Udostępnij in the TopBar; without: no share', () => {
    search = 'stop=7014M&name=%C5%9Awi%C4%99tokrzyska'
    const { unmount } = render(<CityPage />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Udostępnij' })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2, name: 'Świętokrzyska' })).toBeInTheDocument()
    unmount()

    search = ''
    render(<CityPage />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Udostępnij' })).not.toBeInTheDocument()
  })
})
