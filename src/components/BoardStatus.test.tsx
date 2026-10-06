// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardStatus } from './BoardStatus'
import type { BoardApiResponse } from '@/hooks/useBoard'

function makeData(overrides: Partial<BoardApiResponse> = {}): BoardApiResponse {
  return {
    snapshots: [],
    budget: { hourly: 90, daily: 900 },
    status: 'ok',
    throttled: false,
    ...overrides,
  }
}

const FETCHED_AT = '2026-08-01T20:24:11.827Z'

const NOW = Date.parse('2026-08-01T20:30:00.000Z')

describe('BoardStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('warns about stale data when the last fetch is old although the response age is small (board remounted from cache)', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} lastSuccessAt={NOW - 10 * 60_000} data={makeData()} error={false} />)
    expect(screen.getByText('dane sprzed 10 min')).toBeInTheDocument()
  })

  it('stays quiet when the last fetch is fresh', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} lastSuccessAt={NOW - 30_000} data={makeData()} error={false} />)
    expect(screen.queryByText(/dane sprzed/)).not.toBeInTheDocument()
  })

  it('keeps the age growing while a refresh keeps failing', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} lastSuccessAt={NOW} data={makeData()} error={true} />)
    expect(screen.queryByText(/dane sprzed/)).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(4 * 60_000)
    })
    expect(screen.getByText('dane sprzed 4 min')).toBeInTheDocument()
  })

  it('keeps an unknown response age unknown, however old the last fetch is', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={undefined} lastSuccessAt={NOW - 60 * 60_000} data={makeData()} error={false} />)
    expect(screen.queryByText(/dane sprzed/)).not.toBeInTheDocument()
  })
  it('reports the loading state before the first snapshot arrives', () => {
    render(<BoardStatus fetchedAt={undefined} ageMs={undefined} data={null} error={false} />)
    expect(screen.getByText('Wczytywanie…')).toBeInTheDocument()
  })

  it('reports a fetch error', () => {
    render(<BoardStatus fetchedAt={undefined} ageMs={undefined} data={null} error={true} />)
    expect(screen.getByText('Błąd pobierania danych')).toBeInTheDocument()
  })

  it('shows the refresh-cadence note even while still loading, not just once data has arrived', () => {
    render(<BoardStatus fetchedAt={undefined} ageMs={undefined} data={null} error={false} />)
    expect(screen.getByText('Dane odświeżają się automatycznie co ok. 1,5 minuty.')).toBeInTheDocument()
  })

  it('shows the refresh-cadence note even during a fetch error', () => {
    render(<BoardStatus fetchedAt={undefined} ageMs={undefined} data={null} error={true} />)
    expect(screen.getByText('Dane odświeżają się automatycznie co ok. 1,5 minuty.')).toBeInTheDocument()
  })

  it('shows the absolute last-updated timestamp when everything is healthy', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} data={makeData()} error={false} />)

    expect(screen.getByText(/Ostatnia aktualizacja:/)).toBeInTheDocument()
    expect(screen.queryByText(/dane sprzed/)).not.toBeInTheDocument()
    expect(screen.queryByText(/odświeżanie ograniczone/)).not.toBeInTheDocument()
    expect(screen.queryByText(/API nie odpowiada/)).not.toBeInTheDocument()
  })

  it('turns the data age into a refresh-now button when given onRefresh', () => {
    const onRefresh = vi.fn()
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} lastSuccessAt={NOW - 40_000} data={makeData()} error={false} onRefresh={onRefresh} />)

    const button = screen.getByRole('button', { name: 'Aktualizacja 41 s temu — odśwież teraz' })
    expect(button).toHaveTextContent('Aktualizacja 41 s temu')
    expect(button).toHaveAttribute('title', expect.stringContaining('01.08.2026'))
    button.click()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Ostatnia aktualizacja:/)).not.toBeInTheDocument()
  })

  it('always shows a short plain-language note about how often data refreshes', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} data={makeData()} error={false} />)
    expect(screen.getByText('Dane odświeżają się automatycznie co ok. 1,5 minuty.')).toBeInTheDocument()
  })

  it('spells out the data age once the snapshot goes stale', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={7 * 60 * 1000} data={makeData()} error={false} />)
    expect(screen.getByText('dane sprzed 7 min')).toBeInTheDocument()
  })

  it('switches to hours for a very old snapshot', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={95 * 60 * 1000} data={makeData()} error={false} />)
    expect(screen.getByText('dane sprzed 1 h 35 min')).toBeInTheDocument()
  })

  it('stays quiet about the age just below the staleness threshold', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={2 * 60 * 1000} data={makeData()} error={false} />)
    expect(screen.queryByText(/dane sprzed/)).not.toBeInTheDocument()
  })

  it('says the API is not answering when the poller reports degraded', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} data={makeData({ status: 'degraded' })} error={false} />)
    expect(screen.getByText(/API nie odpowiada/)).toBeInTheDocument()
  })

  it('flags throttled refreshing and names the remaining daily budget', () => {
    render(
      <BoardStatus
        fetchedAt={FETCHED_AT}
        ageMs={1000}
        data={makeData({ throttled: true, budget: { hourly: 3, daily: 41 } })}
        error={false}
      />
    )

    const chip = screen.getByText('odświeżanie ograniczone')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveAttribute('title', 'Pozostało 41 zapytań do API na dobę')
    expect(screen.getByText('Pozostało 41 zapytań do API na dobę')).toHaveClass('sr-only')
  })

  it('keeps showing the last-updated timestamp and data age when a later refresh fails, instead of blanking out to the error banner', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={7 * 60 * 1000} data={makeData()} error={true} />)

    expect(screen.getByText(/Ostatnia aktualizacja:/)).toBeInTheDocument()
    expect(screen.getByText('dane sprzed 7 min')).toBeInTheDocument()
    expect(screen.getByText('Błąd ostatniego odświeżenia')).toBeInTheDocument()
    expect(screen.queryByText('Błąd pobierania danych')).not.toBeInTheDocument()
  })

  it('omits the budget tooltip when the API did not report a budget', () => {
    render(
      <BoardStatus
        fetchedAt={FETCHED_AT}
        ageMs={1000}
        data={makeData({ throttled: true, budget: { hourly: null, daily: null } })}
        error={false}
      />
    )

    expect(screen.getByText('odświeżanie ograniczone')).not.toHaveAttribute('title')
  })

  // Dwa różne `degraded`: awaria pobrania i „są godziny, ale nie znamy
  // opóźnień". Ten drugi pojawił się, odkąd tablica potrafi zbudować się
  // z samego rozkładu — komunikat o ostatnich znanych danych byłby wtedy
  // nieprawdą, bo godziny i perony SĄ aktualne.
  it('mówi o braku danych o ruchu, nie o niedostępnym API, gdy stoi na rozkładzie', () => {
    render(
      <BoardStatus
        data={makeData({ status: 'degraded', realizationStale: true })}
        error={false}
        fetchedAt={FETCHED_AT}
        ageMs={1000}
      />
    )

    // Ostrzega też o odwołaniach: `isCancelled` jest tylko w `/operations`,
    // więc na samym rozkładzie odwołany pociąg wygląda jak normalny.
    expect(screen.getByText(/PKP nie podaje dziś danych o ruchu.*możliwe niewidoczne odwołania/)).toBeInTheDocument()
    expect(screen.queryByText(/API nie odpowiada/)).not.toBeInTheDocument()
  })

  // Trzeci wariant `degraded`: realizacja niepełna (poller nie dociągnął
  // wszystkich stron `/operations`). Wiersze bez dopasowanej realizacji
  // pokazują się jako „jeszcze nie wyjechał" mimo że jadą -- baner to prostuje.
  it('ostrzega o niepełnej realizacji zamiast o niedostępnym API', () => {
    render(
      <BoardStatus
        data={makeData({ status: 'degraded', realizationIncomplete: true })}
        error={false}
        fetchedAt={FETCHED_AT}
        ageMs={1000}
      />
    )

    expect(screen.getByText(/Duży ruch.*jeszcze nie wyjechał.*mimo że jadą/)).toBeInTheDocument()
    expect(screen.queryByText(/API nie odpowiada/)).not.toBeInTheDocument()
  })

  // realizationStale (brak CAŁEGO dnia) jest poważniejszy niż realizationIncomplete
  // (brakuje kawałka) -- gdy oba, wygrywa komunikat o braku danych o ruchu.
  it('woli komunikat o braku danych o ruchu, gdy realizacja jest i nieaktualna, i niepełna', () => {
    render(
      <BoardStatus
        data={makeData({ status: 'degraded', realizationStale: true, realizationIncomplete: true })}
        error={false}
        fetchedAt={FETCHED_AT}
        ageMs={1000}
      />
    )

    expect(screen.getByText(/PKP nie podaje dziś danych o ruchu/)).toBeInTheDocument()
    expect(screen.queryByText(/Duży ruch/)).not.toBeInTheDocument()
  })

  it('nadal mówi o niedostępnym API, gdy to pobranie zawiodło', () => {
    render(
      <BoardStatus
        data={makeData({ status: 'degraded', realizationStale: false })}
        error={false}
        fetchedAt={FETCHED_AT}
        ageMs={1000}
      />
    )

    expect(screen.getByText(/API nie odpowiada/)).toBeInTheDocument()
  })

  it('uses the same tokens as ScheduleStatus: error colour only without data, a failed refresh over data is a warning', () => {
    const { container, rerender } = render(<BoardStatus fetchedAt={undefined} ageMs={undefined} data={null} error={true} />)
    // eslint-disable-next-line testing-library/no-node-access
    expect(container.firstElementChild).toHaveClass('text-text-secondary')
    expect(screen.getByText('Błąd pobierania danych')).toHaveClass('text-error-text')
    rerender(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} data={makeData()} error={true} />)
    // Ostatni dobry snapshot wciąż jest na ekranie (#7) — jak „błąd ostatniego odświeżenia" w ScheduleStatus.
    expect(screen.getByText('Błąd ostatniego odświeżenia')).toHaveClass('text-warning-text')
  })
})

