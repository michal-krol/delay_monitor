// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BoardRowList } from './BoardRowList'
import { formatClockTime } from '@/lib/format'
import type { BoardApiRow } from '@/hooks/useBoard'

const ROW: BoardApiRow = {
  scheduleId: '2026',
  orderId: '109',
  operatingDate: '2026-10-01',
  trainNumber: '109',
  trainLabel: 'IC 109',
  carrier: 'IC',
  carrierName: null,
  category: 'IC',
  categoryName: null,
  headsign: 'Kraków Główny',
  plannedAt: '2026-10-01T12:00:00+02:00',
  actualAt: null,
  estimatedDelayMinutes: null,
  delayMinutes: null,
  status: 'notStarted',
  platform: '3',
}

const NOW = Date.parse('2026-10-01T11:52:00+02:00')

function renderRows(rows: BoardApiRow[]) {
  return render(<BoardRowList rows={rows} now={NOW} loading={false} showEmpty={false} emptyMessage="" />)
}

describe('BoardRowList', () => {
  it('marks a row with a disruption with the same icon as the full board (Utrudnienie na trasie)', () => {
    renderRows([{ ...ROW, hasDisruption: true }])
    expect(screen.getByRole('img', { name: 'Utrudnienie na trasie' })).toBeInTheDocument()
  })

  it('shows no disruption icon when the row has none or the field is unknown', () => {
    renderRows([{ ...ROW, hasDisruption: false }, { ...ROW, orderId: '110', trainNumber: '110' }])
    expect(screen.queryByRole('img', { name: 'Utrudnienie na trasie' })).toBeNull()
  })

  it('counts down to the next departure on the Pulpit card', () => {
    renderRows([ROW])
    expect(screen.getByText('za 8 min')).toBeInTheDocument()
  })

  it('shows the forecast as the dominant time ("Przew.") with the plan and countdown below', () => {
    renderRows([{ ...ROW, predictedAt: '2026-10-01T12:05:00+02:00' }])
    expect(screen.getByText('Przew.')).toBeInTheDocument()
    expect(screen.getByText(formatClockTime('2026-10-01T12:05:00+02:00'))).toBeInTheDocument()
    expect(screen.getByText(`Plan ${formatClockTime(ROW.plannedAt)} · za 13 min`)).toBeInTheDocument()
  })

  it('shows a confirmed time as "Faktycznie" with the plan line', () => {
    renderRows([{ ...ROW, actualAt: '2026-10-01T12:03:00+02:00', delayMinutes: 3, status: 'delayed' }])
    expect(screen.getByText('Faktycznie')).toBeInTheDocument()
    expect(screen.getByText(/^Plan \d\d:\d\d/)).toBeInTheDocument()
  })

  it('without realization: label "Plan" and the bare countdown', () => {
    renderRows([ROW])
    expect(screen.getByText('Plan')).toBeInTheDocument()
  })

  it('a cancelled train never counts down', () => {
    renderRows([{ ...ROW, status: 'cancelled' }])
    expect(screen.queryByText(/za \d+ min/)).toBeNull()
    expect(screen.getByText('odwołany')).toBeInTheDocument()
  })

  it('an unconfirmed run is never „punktualnie” (#2): the status comes from the row, not from actualAt', () => {
    // PKP kopiuje plan do `actualAt` przed odjazdem — bez `delayMinutes` to nie fakt.
    renderRows([{ ...ROW, actualAt: ROW.plannedAt }])
    expect(screen.queryByText(/punktualnie/i)).toBeNull()
    expect(screen.getByText('jeszcze nie wyjechał')).toBeInTheDocument()
  })

  it('shows direction, train and platform; „peron —” when the source has no platform', () => {
    renderRows([ROW, { ...ROW, orderId: '110', trainNumber: '110', trainLabel: 'IC 110', platform: null }])
    expect(screen.getAllByText('Kraków Główny')).toHaveLength(2)
    expect(screen.getByText(/IC 109 · peron 3/)).toBeInTheDocument()
    expect(screen.getByText(/IC 110 · peron —/)).toBeInTheDocument()
  })

  it('shows the short carrier code with its logo, never the full legal name; a generic label when the code is empty', () => {
    renderRows([{ ...ROW, carrierName: '„PKP Intercity” Spółka Akcyjna' }, { ...ROW, orderId: '110', trainNumber: '110', carrier: '' }])
    expect(screen.getByText(/IC · IC 109/)).toBeInTheDocument()
    expect(screen.getByText(/Nieznany przewoźnik · IC 109/)).toBeInTheDocument()
    expect(screen.queryByText(/Spółka Akcyjna/)).toBeNull()
    // Logo dekoracyjne (kod stoi obok jako tekst) — pusty alt.
    // eslint-disable-next-line testing-library/no-node-access
    expect(document.querySelector('img[src="/carriers/pkp-ic.svg"]')).toHaveAttribute('alt', '')
  })

  it('each row links to its connection', () => {
    renderRows([ROW])
    expect(screen.getByRole('link')).toHaveAttribute('href', '/connection/2026/109/2026-10-01?train=IC%20109')
  })

  it('a row without an operating date is not a link (/api/train would reject it)', () => {
    renderRows([{ ...ROW, operatingDate: '' }])
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Kraków Główny')).toBeInTheDocument()
  })

  it('loading: two skeleton rows instead of a text line, still announced as „Wczytywanie…” to screen readers', () => {
    render(<BoardRowList rows={[]} now={NOW} loading showEmpty={false} emptyMessage="" />)
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(2)
    expect(screen.getByText('Wczytywanie…')).toHaveClass('sr-only')
  })

  it('loaded and empty: the empty message, no skeleton („brak odjazdów” ≠ „jeszcze się ładuje”)', () => {
    render(<BoardRowList rows={[]} now={NOW} loading={false} showEmpty emptyMessage="Brak odjazdów" />)
    expect(screen.queryByTestId('skeleton-row')).toBeNull()
    expect(screen.getByText('Brak odjazdów')).toBeInTheDocument()
  })
})
