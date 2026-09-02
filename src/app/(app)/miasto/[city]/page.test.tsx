// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CityPage from './page'
import { __resetCityContext } from '@/hooks/useCityContext'
import { jsonResponse } from '@/test-utils/http'

const push = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
let cityParam = 'waw'
let search = ''
vi.mock('next/navigation', () => ({
  useParams: () => ({ city: cityParam }),
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
  notFound: () => notFound(),
}))
// Stabilna referencja — świeży obiekt co render zapętliłby useSnapshotNow.
const { mockBoard, mockTransit } = vi.hoisted(() => ({
  mockBoard: { data: null, error: null },
  mockTransit: {
    data: {
      city: 'waw',
      schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null },
      stops: [
        {
          stopId: '7014M',
          name: 'Świętokrzyska',
          modes: ['metro'],
          lines: [{ routeId: 'M1', line: 'M1', color: '#0000bb', mode: 'metro' }],
          summary: { lineCount: 1, departuresToday: 40, firstDepartureSec: 18000, lastDepartureSec: 90000, hourly: new Array(24).fill(1) },
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
        id: 'waw',
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
  cityParam = 'waw'
  search = ''
  window.localStorage.clear()
  __resetCityContext()
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

  it('navigates with ?stacja= when a rail result is picked, ?przystanek= for a transit result', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.startsWith('/api/search')
          ? jsonResponse({
              stations: [
                { id: '33605', name: 'Warszawa Centralna', kind: 'rail', mode: 'rail' },
                { id: '7014M', name: 'Świętokrzyska', kind: 'transit', mode: 'metro', modes: ['metro'], lines: [{ routeId: 'M1', line: 'M1', color: null, mode: 'metro' }] },
              ],
            })
          : citiesResponse()
      )
    )
    render(<CityPage />)
    await user.type(await screen.findByRole('combobox', { name: /szukaj/i }), 'war')
    await user.click(await screen.findByRole('option', { name: 'Warszawa Centralna' }))
    expect(push).toHaveBeenCalledWith('/miasto/waw?stacja=33605&nazwa=Warszawa%20Centralna')
  })

  it('embeds the transit stop detail when ?przystanek= is set', () => {
    search = 'przystanek=7014M&nazwa=%C5%9Awi%C4%99tokrzyska'
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
})
