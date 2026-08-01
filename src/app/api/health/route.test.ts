import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/board/instance', () => ({
  appConfig: { dataSource: 'mock' },
  poller: {
    isAwake: vi.fn(() => false),
    getStatus: vi.fn(() => 'ok'),
  },
}))

describe('GET /api/health', () => {
  it('reports data source, poller wake state, and poller status', async () => {
    const { GET } = await import('./route')
    const response = await GET()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ dataSource: 'mock', pollerAwake: false, pollerStatus: 'ok' })
  })
})
