// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DayTimetablePanel } from './DayTimetablePanel'
import { jsonResponse } from '@/test-utils/http'

afterEach(() => vi.unstubAllGlobals())

describe('DayTimetablePanel', () => {
  it('fetches the timetable for the stop+route and renders it', async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({
        schedule: { state: 'ready', loadedAt: null, ageMs: 1, phase: null, serviceDates: null, feedVersion: null },
        entries: [{ tripId: 't', departureSec: 8 * 3600 + 5 * 60, plannedAt: '', headsign: null, frequencyBased: false }],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<DayTimetablePanel city="waw" stopId="7014M" routeId="M1" lineLabel="M1" />)

    expect(await screen.findByText('08')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/gtfs/timetable?city=waw&stop=7014M&route=M1')
    expect(screen.getByText('Cała doba — linia M1')).toBeInTheDocument()
  })

  it('shows an error note when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))))
    render(<DayTimetablePanel city="waw" stopId="7014M" routeId="M1" lineLabel="M1" />)
    expect(await screen.findByText('Nie udało się pobrać tabliczki dobowej.')).toBeInTheDocument()
  })
})
