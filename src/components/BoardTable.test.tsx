// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardTable } from './BoardTable'
import { formatClockTime } from '@/lib/format'
import type { BoardApiRow } from '@/hooks/useBoard'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

beforeEach(() => {
  push.mockClear()
})

const NOW = new Date('2026-08-01T12:00:00+02:00').getTime()

const PLANNED = '2026-08-01T12:30:00+02:00'
const ACTUAL = '2026-08-01T12:33:00+02:00'
const PREDICTED = '2026-08-01T12:34:00+02:00'

/**
 * Godziny liczone tą samą funkcją, którą renderuje komponent — nie wpisane na
 * sztywno. `formatClockTime` wymusza strefę warszawską, więc wynik jest ten sam
 * pod `TZ=Europe/Warsaw` i `TZ=UTC` (AGENTS.md #1).
 */
function shown(iso: string): string {
  return formatClockTime(iso)
}

function row(overrides: Partial<BoardApiRow> = {}): BoardApiRow {
  return {
    scheduleId: '2026',
    orderId: '12345',
    operatingDate: '2026-08-01',
    trainNumber: '1',
    trainLabel: 'EIC 1',
    carrier: 'IC',
    carrierName: 'PKP Intercity',
    category: 'EIC',
    categoryName: 'Express InterCity',
    headsign: 'Kraków Główny',
    via: [],
    viaRemaining: 0,
    plannedAt: PLANNED,
    actualAt: null,
    predictedAt: null,
    delayMinutes: null,
    status: 'notStarted',
    platform: null,
    track: null,
    estimatedDelayMinutes: null,
    ...overrides,
  }
}

function renderTable(rows: BoardApiRow[]) {
  return render(<BoardTable stationName="Warszawa Zachodnia" direction="departures" rows={rows} now={NOW} loading={false} />)
}

describe('BoardTable — godzina: PLAN / PROGNOZA / FAKT', () => {
  it('shows the planned time alone when nothing is known beyond the plan', () => {
    renderTable([row()])

    expect(screen.getByText(shown(PLANNED))).toBeInTheDocument()
    // Powtórzenie planu w drugiej linii udawałoby pomiar, którego nie ma.
    expect(screen.getAllByText(shown(PLANNED))).toHaveLength(1)
  })

  it('shows the confirmed actual time under the plan', () => {
    renderTable([row({ actualAt: ACTUAL, delayMinutes: 3, status: 'delayed' })])

    expect(screen.getByText(shown(PLANNED))).toBeInTheDocument()
    expect(screen.getByText(shown(ACTUAL))).toBeInTheDocument()
    expect(screen.getByText('+3 min')).toBeInTheDocument()
  })

  it('marks a prediction as a prediction instead of passing it off as a fact', () => {
    renderTable([row({ predictedAt: PREDICTED, status: 'enRoute' })])

    const predicted = screen.getByText(shown(PREDICTED))
    expect(predicted).toHaveClass('italic')
    expect(predicted).toHaveAttribute('title', expect.stringContaining('przewidywana'))
  })

  it('never shows an unconfirmed actual time as a fact', () => {
    // PKP wpisuje w `actualAt` kopię planu dla pociągu, który jeszcze nie
    // wyjechał (AGENTS.md #2). Bez potwierdzenia (`delayMinutes === null`)
    // ta wartość nie może trafić do wiersza jako godzina faktyczna.
    renderTable([row({ actualAt: PLANNED, delayMinutes: null, status: 'notStarted' })])

    expect(screen.getAllByText(shown(PLANNED))).toHaveLength(1)
  })

  it('plakietka niewyruszonego pociągu z prognozą pokazuje spodziewane spóźnienie', () => {
    renderTable([row({ status: 'notStarted', predictedAt: PREDICTED, predictedDelayMinutes: 34 })])

    expect(screen.getByText('jeszcze nie wyjechał · prognoza +34 min')).toBeInTheDocument()
  })
})

describe('BoardTable — peron i tor', () => {
  it('distinguishes "not given at all" from a known platform with an unknown track', () => {
    renderTable([row({ platform: null, track: null }), row({ trainNumber: '2', platform: '2', track: null })])

    expect(screen.getByText('nie podano')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows platform and track as two separate values', () => {
    renderTable([row({ platform: '2', track: '4' })])

    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.queryByText('2/4')).not.toBeInTheDocument()
  })
})

describe('BoardTable — kierunek i „przez"', () => {
  it('lists the intermediate stops under the destination', () => {
    renderTable([row({ via: ['Pruszków', 'Opoczno', 'Kielce'], viaRemaining: 0 })])

    expect(screen.getByText('Kraków Główny')).toBeInTheDocument()
    expect(screen.getByText('przez Pruszków, Opoczno, Kielce')).toBeInTheDocument()
  })

  it('counts the stops that did not fit, with the Polish noun inflected', () => {
    const { unmount } = renderTable([row({ via: ['Pruszków'], viaRemaining: 12 })])
    expect(screen.getByText('przez Pruszków · +12 przystanków')).toBeInTheDocument()
    unmount()

    renderTable([row({ via: ['Pruszków'], viaRemaining: 1 })])
    expect(screen.getByText('przez Pruszków · +1 przystanek')).toBeInTheDocument()
  })

  it('shows the destination alone when the route is unknown, inventing nothing', () => {
    renderTable([row({ via: [], viaRemaining: 0 })])

    expect(screen.getByText('Kraków Główny')).toBeInTheDocument()
    // Zawężone do wiersza: „przez" jest też podpisem nagłówka kolumny.
    const dataRow = screen.getAllByRole('row')[1]
    expect(within(dataRow).queryByText(/^przez/)).not.toBeInTheDocument()
  })
})

describe('BoardTable — rozwijanie listy', () => {
  function manyRows(count: number): BoardApiRow[] {
    return Array.from({ length: count }, (_, index) =>
      row({ trainNumber: String(index), trainLabel: `IC ${index}`, plannedAt: `2026-08-01T${12 + Math.floor(index / 60)}:${String(index % 60).padStart(2, '0')}:00+02:00` })
    )
  }

  it('shows ten rows first and reveals the rest on demand, without fetching anything', async () => {
    const user = userEvent.setup()
    renderTable(manyRows(25))

    expect(screen.getAllByRole('row')).toHaveLength(11) // 10 wierszy + nagłówek
    const more = screen.getByRole('button', { name: /Pokaż więcej połączeń/ })
    expect(more).toHaveTextContent('15')

    await user.click(more)

    expect(screen.getAllByRole('row')).toHaveLength(26)
    expect(screen.queryByRole('button', { name: /Pokaż więcej połączeń/ })).not.toBeInTheDocument()
  })

  it('does not offer the button when everything already fits', () => {
    renderTable(manyRows(4))

    expect(screen.queryByRole('button', { name: /Pokaż więcej połączeń/ })).not.toBeInTheDocument()
  })
})

describe('BoardTable — sygnalizacja zmiany opóźnienia', () => {
  it('does not flash on the first render -- everything would be "new" and mean nothing', () => {
    renderTable([row({ delayMinutes: 3, status: 'delayed' })])

    expect(screen.getAllByRole('row').filter((r) => r.classList.contains('delay-changed'))).toHaveLength(0)
  })

  it('flashes only the row whose delay actually changed', () => {
    const first = row({ trainNumber: '1', trainLabel: 'IC 1', delayMinutes: 3, status: 'delayed' })
    const second = row({ trainNumber: '2', trainLabel: 'IC 2', delayMinutes: 5, status: 'delayed' })
    const { rerender } = renderTable([first, second])

    rerender(
      <BoardTable
        stationName="Warszawa Zachodnia"
        direction="departures"
        rows={[{ ...first, delayMinutes: 4 }, second]}
        now={NOW}
        loading={false}
      />
    )

    const flashing = screen.getAllByRole('row').filter((r) => r.classList.contains('delay-changed'))
    expect(flashing).toHaveLength(1)
    expect(within(flashing[0]).getByText('IC 1')).toBeInTheDocument()
  })
})
