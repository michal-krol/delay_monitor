// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PollerDiagnostics } from './PollerDiagnostics'
import { jsonResponse } from '@/test-utils/http'

const HEALTHY = {
  dataSource: 'live',
  pollerAwake: true,
  pollerStatus: 'ok',
  throttled: false,
  intervalMs: 90000,
  budget: { hourly: 62, daily: 702, hourlyLimit: 100, dailyLimit: 1000 },
  feeds: {
    operations: { ok: true, lastSuccessAt: '2026-08-01T12:00:00.000Z', records: 128 },
    schedules: { ok: true, lastSuccessAt: '2026-08-01T12:00:00.000Z', records: 44, usedFullRouteFallback: false },
    disruptions: { ok: true, lastSuccessAt: '2026-08-01T12:00:00.000Z', records: 3 },
    dataVersion: null,
  },
}

function stubHealth(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(() => jsonResponse(body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SHOW_DIAGNOSTICS', 'true')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('PollerDiagnostics', () => {
  // Najważniejszy test w tym pliku: panel nie może wyciec na produkcję ani
  // pikselem, ani zapytaniem sieciowym.
  it('renders nothing and issues no request when the environment flag is off', () => {
    vi.stubEnv('NEXT_PUBLIC_SHOW_DIAGNOSTICS', 'false')
    const fetchMock = stubHealth(HEALTHY)

    const { container } = render(<PollerDiagnostics collapsed={false} />)

    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats an unset flag as production, not as development', () => {
    vi.stubEnv('NEXT_PUBLIC_SHOW_DIAGNOSTICS', '')
    const fetchMock = stubHealth(HEALTHY)

    const { container } = render(<PollerDiagnostics collapsed={false} />)

    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the data source, poller state, pace and remaining PKP budget', async () => {
    stubHealth(HEALTHY)

    render(<PollerDiagnostics collapsed={false} />)

    expect(await screen.findByText('live')).toBeInTheDocument()
    expect(screen.getByText('czuwa')).toBeInTheDocument()
    expect(screen.getByText('co 90 s')).toBeInTheDocument()
    expect(screen.getByText('62 / 100')).toBeInTheDocument()
    expect(screen.getByText('702 / 1000')).toBeInTheDocument()
  })

  // AGENTS.md #3: brak nagłówka znaczy „nie wiadomo", nigdy „zero".
  // Potraktowanie tego jak zera raz już zepchnęło poller na stały interwał awaryjny.
  it('shows an unknown budget as unknown, never as zero', async () => {
    stubHealth({ ...HEALTHY, budget: null })

    render(<PollerDiagnostics collapsed={false} />)

    await screen.findByText('live')
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByText('0 / 100')).not.toBeInTheDocument()
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument()
  })

  it('shows a known zero as zero -- that is a real, alarming value', async () => {
    stubHealth({ ...HEALTHY, budget: { hourly: 0, daily: 5, hourlyLimit: 100, dailyLimit: 1000 } })

    render(<PollerDiagnostics collapsed={false} />)

    expect(await screen.findByText('0 / 100')).toBeInTheDocument()
  })

  it('reports the slower pace when the poller has throttled itself', async () => {
    stubHealth({ ...HEALTHY, throttled: true, intervalMs: 300000, pollerStatus: 'degraded' })

    render(<PollerDiagnostics collapsed={false} />)

    expect(await screen.findByText('co 300 s (zdławiony)')).toBeInTheDocument()
    expect(screen.getByText('degraded')).toBeInTheDocument()
  })

  it('stays out of the way when the sidebar is collapsed', () => {
    const fetchMock = stubHealth(HEALTHY)

    const { container } = render(<PollerDiagnostics collapsed />)

    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not break the sidebar when the health endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))

    const { container } = render(<PollerDiagnostics collapsed={false} />)

    // Nagłówek panelu jest renderowany od razu, jeszcze przed odpowiedzią —
    // awaria zostawia go bez wartości, nie wywraca paska bocznego.
    expect(await screen.findByText('Diagnostyka')).toBeInTheDocument()
    expect(container).not.toBeEmptyDOMElement()
  })

  // Sedno rozszerzenia: awaria rozkładu albo utrudnień degraduje CICHO --
  // `pollerStatus` zostaje 'ok'. Bez rozbicia na źródła panel pokazywałby
  // wtedy stan zdrowy, mimo że tablica traci kierunek i perony.
  it('shows a silently failed feed even while the poller reports ok', async () => {
    stubHealth({
      ...HEALTHY,
      feeds: {
        ...HEALTHY.feeds,
        schedules: { ok: false, lastSuccessAt: null, records: null, usedFullRouteFallback: false },
      },
    })
    render(<PollerDiagnostics collapsed={false} />)

    expect(await screen.findByText('Źródła PKP')).toBeInTheDocument()
    expect(screen.getByText('Rozkład')).toBeInTheDocument()
    // „Nigdy się nie udało" renderuje się jako „—", nigdy jako 0 (AGENTS.md #3).
    expect(screen.getByText(/— · —/)).toBeInTheDocument()
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('flags the fullRoute fallback, which used to exist only in a server log', async () => {
    stubHealth({
      ...HEALTHY,
      feeds: {
        ...HEALTHY.feeds,
        schedules: { ok: true, lastSuccessAt: '2026-08-01T12:00:00.000Z', records: 10498, usedFullRouteFallback: true },
      },
    })
    render(<PollerDiagnostics collapsed={false} />)

    expect(await screen.findByText('tryb awaryjny')).toBeInTheDocument()
  })

  // Wersja danych pojawia się TYLKO gdy poller miał powód dopytać -- brak tego
  // wiersza jest dobrą wiadomością, nie brakiem informacji.
  it('hides the PKP data version until the poller had a reason to ask', async () => {
    stubHealth(HEALTHY)
    render(<PollerDiagnostics collapsed={false} />)

    expect(await screen.findByText('Źródła PKP')).toBeInTheDocument()
    expect(screen.queryByText('Dane PKP')).not.toBeInTheDocument()
  })

  it('survives a server that does not report feeds at all', async () => {
    // Panel deweloperski nie ma prawa wywrócić paska bocznego -- ta sama
    // zasada co pusty catch przy błędzie fetcha.
    const withoutFeeds: Record<string, unknown> = { ...HEALTHY }
    delete withoutFeeds.feeds
    stubHealth(withoutFeeds)
    render(<PollerDiagnostics collapsed={false} />)

    expect(await screen.findByText('live')).toBeInTheDocument()
    expect(screen.queryByText('Źródła PKP')).not.toBeInTheDocument()
  })
})
