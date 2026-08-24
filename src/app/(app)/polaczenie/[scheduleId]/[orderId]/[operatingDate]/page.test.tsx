// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import Page from './page'

/**
 * Ten sam wzorzec i uzasadnienie co w `odjazdy/[stationId]/page.test.tsx` —
 * `params` w Next.js 16 App Router jest `Promise`-em przekazywanym jako prop
 * strony (potwierdzone w node_modules/next/dist/docs/ dla wersji 16.2.12),
 * ale to komponent kliencki (`'use client'`), więc czyta te same wartości
 * synchronicznie przez `useParams()`/`useSearchParams()` z `next/navigation`,
 * nie przez propsy. Stąd mock hooków, nie renderowanie `<Page params={...} />`.
 */
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const useParamsMock = vi.fn<() => { scheduleId: string; orderId: string; operatingDate: string }>()
let searchParamsValue = new URLSearchParams()

vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useParams: () => useParamsMock(),
  useSearchParams: () => searchParamsValue,
}))

global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch // never resolves — testujemy tylko walidację wejścia, nie stan po fetchu

describe('Page (/polaczenie/...)', () => {
  beforeEach(() => {
    notFound.mockClear()
    searchParamsValue = new URLSearchParams()
  })

  it('nieprawidłowy operatingDate wywołuje notFound()', () => {
    useParamsMock.mockReturnValue({ scheduleId: '123', orderId: '456', operatingDate: 'nie-data' })

    expect(() => render(<Page />)).toThrow('NEXT_NOT_FOUND')
  })

  it('nieprawidłowy scheduleId (nie same cyfry) wywołuje notFound()', () => {
    useParamsMock.mockReturnValue({ scheduleId: 'abc', orderId: '456', operatingDate: '2026-08-23' })

    expect(() => render(<Page />)).toThrow('NEXT_NOT_FOUND')
  })

  it('poprawne parametry nie wywołują notFound()', () => {
    useParamsMock.mockReturnValue({ scheduleId: '123', orderId: '456', operatingDate: '2026-08-23' })

    render(<Page />)

    expect(notFound).not.toHaveBeenCalled()
  })
})
