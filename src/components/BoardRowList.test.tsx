// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BoardRowList } from './BoardRowList'
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
    expect(screen.getByText(/za 8 min/)).toBeInTheDocument()
  })
})
