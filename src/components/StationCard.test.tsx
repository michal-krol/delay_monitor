// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StationCard } from './StationCard'
import { formatClockTime } from '@/lib/format'
import type { BoardApiRow, BoardApiSnapshot } from '@/hooks/useBoard'

function makeSnapshot(overrides: Partial<BoardApiSnapshot> = {}): BoardApiSnapshot {
  return {
    stationId: '5100',
    stationName: 'Warszawa Centralna',
    departures: [],
    arrivals: [],
    fetchedAt: new Date().toISOString(),
    ageMs: 1000,
    ...overrides,
  }
}

function departure(overrides: Partial<BoardApiRow> = {}): BoardApiRow {
  return {
    scheduleId: '1', orderId: '1', operatingDate: '2026-08-01', trainNumber: '1', trainLabel: 'EIC 1',
    carrier: 'IC', carrierName: null, category: 'EIC', categoryName: null, headsign: 'Kraków',
    plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0,
    status: 'onTime', platform: '1', estimatedDelayMinutes: null,
    ...overrides,
  }
}

function renderCard(snapshot: BoardApiSnapshot | null, props: { error?: boolean; configError?: boolean; stationName?: string } = {}) {
  return render(
    <StationCard stationId="5100" stationName={props.stationName ?? 'Warszawa Centralna'} snapshot={snapshot} error={props.error ?? false} configError={props.configError ?? false} />
  )
}

describe('StationCard', () => {
  it('shows the station name and the delay as text next to its departure (not color-only)', () => {
    renderCard(makeSnapshot({ departures: [departure({ delayMinutes: 5, status: 'delayed' })] }))
    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.getByText('+5 min')).toBeInTheDocument()
  })

  it('the heading is a real link to the station board — no full-card overlay button', () => {
    renderCard(null)
    const heading = screen.getByRole('heading', { name: 'Warszawa Centralna' })
    expect(within(heading).getByRole('link')).toHaveAttribute('href', '/station/5100?name=Warszawa%20Centralna')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows at most the 2 nearest upcoming departures', () => {
    const rows = [1, 2, 3].map((n) => departure({ orderId: String(n), trainNumber: String(n), trainLabel: `EIC ${n}`, plannedAt: new Date(Date.now() + n * 10 * 60000).toISOString() }))
    renderCard(makeSnapshot({ departures: rows }))
    const list = screen.getByRole('list')
    expect(list).toHaveTextContent('EIC 1')
    expect(list).toHaveTextContent('EIC 2')
    expect(list).not.toHaveTextContent('EIC 3')
  })

  it('shows the planned departure time large', () => {
    const plannedAt = new Date(Date.now() + 15 * 60000).toISOString()
    renderCard(makeSnapshot({ departures: [departure({ plannedAt })] }))
    expect(screen.getByText(formatClockTime(plannedAt))).toBeInTheDocument()
  })

  it('each departure links to its connection', () => {
    renderCard(makeSnapshot({ departures: [departure()] }))
    expect(within(screen.getByRole('list')).getByRole('link')).toHaveAttribute('href', '/connection/1/1/2026-08-01?train=EIC%201')
  })

  it('no glow and no decorative art: the card is a calm surface', () => {
    const { container } = renderCard(makeSnapshot({ departures: [departure({ delayMinutes: 5, status: 'delayed' })] }))
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
    const article = container.querySelector('article')
    expect(article).not.toHaveClass('glow-ring')
    // eslint-disable-next-line testing-library/no-node-access
    expect(article?.querySelector(':scope > [aria-hidden="true"]')).toBeNull()
  })

  it('no per-card „N opóźnionych” counter: status lives next to the departure it describes', () => {
    renderCard(makeSnapshot({ departures: [departure({ delayMinutes: 5, status: 'delayed' })] }))
    expect(screen.queryByText(/opóźnion/)).toBeNull()
  })

  it('excludes departures that already passed, keeping only upcoming ones (past ones stay in FullBoard only)', () => {
    const past = departure({ trainLabel: 'PAST1', plannedAt: new Date(Date.now() - 2 * 60000).toISOString() })
    const future = departure({ orderId: '2', trainNumber: '2', trainLabel: 'FUTURE2', plannedAt: new Date(Date.now() + 10 * 60000).toISOString() })
    renderCard(makeSnapshot({ departures: [past, future] }))
    const list = screen.getByRole('list')
    expect(list).toHaveTextContent('FUTURE2')
    expect(list).not.toHaveTextContent('PAST1')
  })

  it('shows the empty message rather than backfilling with a past departure', () => {
    renderCard(makeSnapshot({ departures: [departure({ trainLabel: 'PAST1', plannedAt: new Date(Date.now() - 2 * 60000).toISOString() })] }))
    expect(screen.queryByText(/PAST1/)).not.toBeInTheDocument()
    expect(screen.getByText('Brak odjazdów w najbliższych godzinach')).toBeInTheDocument()
  })

  it('shows a loading state when there is no snapshot yet', () => {
    renderCard(null, { stationName: 'X' })
    expect(screen.getByText('Wczytywanie…')).toBeInTheDocument()
  })

  it('shows the empty-station message instead of an error when there are no departures', () => {
    renderCard(makeSnapshot({ stationName: 'X', departures: [] }), { stationName: 'X' })
    expect(screen.getByText('Brak odjazdów w najbliższych godzinach')).toBeInTheDocument()
  })

  it('snapshot + refresh error shows data age and keeps the rows', () => {
    const fetchedAt = new Date(Date.now() - 3 * 60000).toISOString()
    renderCard(makeSnapshot({ fetchedAt, departures: [departure()] }), { error: true, stationName: 'X' })
    // Ostatni dobry snapshot zostaje na ekranie — błąd odświeżenia nie
    // zastępuje danych czerwonym komunikatem, tylko wiekiem danych (#7).
    expect(screen.queryByText('Nie udało się pobrać danych')).not.toBeInTheDocument()
    expect(screen.getByText(`Nie udało się odświeżyć · dane z ${formatClockTime(fetchedAt)}`)).toBeInTheDocument()
    expect(screen.getByText('Kraków')).toBeInTheDocument()
  })

  it('error without snapshot shows error', () => {
    renderCard(null, { error: true, stationName: 'X' })
    expect(screen.getByText('Nie udało się pobrać danych')).toBeInTheDocument()
  })

  it('renders a config error banner instead of the card when configError is true', () => {
    renderCard(null, { configError: true, stationName: 'X' })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
