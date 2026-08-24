// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import Page from './page'

/**
 * `params`/`searchParams` w Next.js 16 App Router to `Promise`-y przekazywane
 * do `page.tsx` jako propsy (zweryfikowane w `node_modules/next/dist/docs/
 * 01-app/03-api-reference/03-file-conventions/page.md`, wersja zainstalowana
 * 16.2.12) — ale to dotyczy PROPSÓW strony. Komponent kliencki nie musi ich
 * przyjmować: `useParams()`/`useSearchParams()` z `next/navigation` czytają te
 * same wartości synchronicznie, bez `Promise`/`use()`/Suspense. To jedyny
 * sposób zachowania synchronicznego `if (!pattern.test(id)) notFound()` PRZED
 * jakimikolwiek hookami w komponencie klienckim (`'use client'` nie może być
 * `async function`, więc `await params` nie wchodzi w grę; `React.use(params)`
 * zawiesiłby render przy pierwszym wywołaniu, bo `createParamsFromClient` w
 * Next nie preinicjalizuje `.status`/`.value` na tej obietnicy — sprawdzone w
 * `node_modules/next/dist/server/request/params.js`, `makeUntrackedParams`).
 * Stąd mock `useParams` zamiast propa `params` — to faktyczny kontrakt strony.
 */
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const useParamsMock = vi.fn<() => { stationId: string }>()
let searchParamsValue = new URLSearchParams()

vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useParams: () => useParamsMock(),
  useSearchParams: () => searchParamsValue,
}))

vi.mock('@/hooks/useBoard', () => ({
  useBoard: () => ({ data: null, error: null }),
}))

describe('Page (/odjazdy/[stationId])', () => {
  beforeEach(() => {
    notFound.mockClear()
    searchParamsValue = new URLSearchParams()
  })

  it('nieprawidłowy stationId (nie same cyfry) wywołuje notFound()', () => {
    useParamsMock.mockReturnValue({ stationId: '33605; DROP TABLE' })

    expect(() => render(<Page />)).toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('poprawny stationId (same cyfry) renderuje się bez wywołania notFound()', () => {
    useParamsMock.mockReturnValue({ stationId: '33605' })
    searchParamsValue = new URLSearchParams({ name: 'Warszawa Centralna' })

    render(<Page />)

    expect(notFound).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
  })

  it('brak ?name= w URL-u pokazuje stationId jako zapasową nazwę zamiast pustego nagłówka', () => {
    useParamsMock.mockReturnValue({ stationId: '33605' })

    render(<Page />)

    expect(notFound).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '33605' })).toBeInTheDocument()
  })
})
