// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FullBoard } from './FullBoard'
import { StationCard } from './StationCard'
import { TransitDepartureList } from './TransitDepartureList'
import type { BoardApiSnapshot } from '@/hooks/useBoard'
import { jsonResponse } from '@/test-utils/http'

// FullBoard nawiguje do szczegółów połączenia przez `useRouter()` (Task 3.1) —
// bez mocka renderowanie poza App Routerem rzuca "expected app router to be mounted".
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

/**
 * Wszystko, co widzi użytkownik, pochodzi z API PKP — czyli z systemu, nad
 * którym nie mamy kontroli. Gdyby kiedykolwiek zwrócił nazwę stacji albo
 * kierunek zawierający znaczniki, nie mogą one trafić do DOM-u jako HTML.
 *
 * React escapuje domyślnie, więc to test regresyjny: pilnuje, że nikt nie
 * wprowadzi `dangerouslySetInnerHTML` ani ręcznego wstawiania znaczników
 * w miejscu, gdzie renderujemy dane z zewnątrz.
 */

const PAYLOADS = [
  '<script>window.__xss = true</script>',
  '<img src=x onerror="window.__xss = true">',
  '"><svg onload="window.__xss = true">',
  'javascript:window.__xss=true',
  '<iframe src="https://example.invalid"></iframe>',
]

function snapshotWith(payload: string): BoardApiSnapshot {
  return {
    stationId: '5100',
    stationName: payload,
    departures: [
      {
        scheduleId: '1',
        orderId: '1',
        operatingDate: '2026-08-01',
        trainNumber: payload,
        trainLabel: payload,
        carrier: payload,
        carrierName: payload,
        category: payload,
        categoryName: payload,
        headsign: payload,
        plannedAt: new Date(Date.now() + 5 * 60000).toISOString(),
        actualAt: null,
        delayMinutes: 3,
        status: 'delayed',
        platform: payload,
        estimatedDelayMinutes: null,
      },
    ],
    arrivals: [],
    fetchedAt: new Date().toISOString(),
    ageMs: 1000,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as unknown as Record<string, unknown>).__xss
})

describe('dane z API nigdy nie są traktowane jak HTML', () => {
  it('kafelka stacji renderuje wrogą treść jako tekst', () => {
    for (const payload of PAYLOADS) {
      const { container, unmount } = render(
        <StationCard
          stationId="5100"
          stationName={payload}
          snapshot={snapshotWith(payload)}
          error={false}
          configError={false}
          onExpand={vi.fn()}
          onRemove={vi.fn()}
        />
      )

      // container.querySelector jest tu celowy, nie niedopatrzeniem: `<script>`
      // i `<iframe>` nie mają użytecznej roli ARIA, więc getByRole nie może ich
      // znaleźć — to jedyny sposób sprawdzenia, że dane z API nie stały się
      // prawdziwym znacznikiem HTML.
      // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
      expect(container.querySelector('script'), `payload: ${payload}`).toBeNull()
      // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
      expect(container.querySelector('iframe'), `payload: ${payload}`).toBeNull()
      // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
      expect(container.querySelector('svg[onload]'), `payload: ${payload}`).toBeNull()
      expect((window as unknown as Record<string, unknown>).__xss, `payload: ${payload}`).toBeUndefined()

      unmount()
    }
  })

  it('pełna tablica renderuje wrogą treść jako tekst', async () => {
    for (const payload of PAYLOADS) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() =>
          jsonResponse({ snapshots: [snapshotWith(payload)], budget: undefined, status: 'ok', throttled: false })
        )
      )

      const { container, unmount } = render(
        <FullBoard
          stationId="5100"
          stationName={payload}
          isFavourite={false}
          onToggleFavourite={vi.fn()}
          onClose={vi.fn()}
        />
      )

      await screen.findAllByRole('row')

      // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
      expect(container.querySelector('script'), `payload: ${payload}`).toBeNull()
      // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
      expect(container.querySelector('iframe'), `payload: ${payload}`).toBeNull()
      expect((window as unknown as Record<string, unknown>).__xss, `payload: ${payload}`).toBeUndefined()

      unmount()
      vi.unstubAllGlobals()
    }
  })

  it('ładunki w danych GTFS (route_color, route_long_name, trip_headsign, stop_name) renderują się jako tekst', () => {
    for (const payload of PAYLOADS) {
      const { container, unmount } = render(
        <TransitDepartureList
          departures={[
            {
              tripId: payload,
              routeId: payload,
              line: payload,
              mode: 'bus',
              // route_color surowy z cudzego serwera — LineBadge dostaje go jako `color`.
              color: payload,
              headsign: payload,
              plannedAt: '2026-09-02T14:30:00+02:00',
              departureSec: 52200,
              serviceDate: '2026-09-02',
              stopId: payload,
              platformCode: payload,
              wheelchair: 0,
              frequencyBased: false,
            },
          ]}
        />
      )

      // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
      expect(container.querySelector('script'), `payload: ${payload}`).toBeNull()
      // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
      expect(container.querySelector('iframe'), `payload: ${payload}`).toBeNull()
      // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
      expect(container.querySelector('svg[onload]'), `payload: ${payload}`).toBeNull()
      // Niezaufany route_color nie może wejść do wartości CSS jako cokolwiek poza
      // zwalidowanym #RRGGBB — LineBadge pada wtedy na neutralny token.
      // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
      const badge = container.querySelector('[style]')
      expect(badge?.getAttribute('style') ?? '', `payload: ${payload}`).not.toContain(payload)
      expect((window as unknown as Record<string, unknown>).__xss, `payload: ${payload}`).toBeUndefined()

      unmount()
    }
  })

  it('wroga nazwa stacji trafia do dokumentu jako zwykły tekst', () => {
    const payload = '<script>window.__xss = true</script>'
    render(
      <StationCard
        stationId="5100"
        stationName={payload}
        snapshot={null}
        error={false}
        configError={false}
        onExpand={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    // Widoczny dokladnie taki, jaki przyszedl — czyli zostal zescapowany.
    expect(screen.getByRole('heading', { name: payload })).toBeInTheDocument()
  })
})
