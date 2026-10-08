// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetPollingSuccess, lastPollingSuccessAt, usePolling } from './usePolling'

beforeEach(() => {
  vi.useFakeTimers()
  __resetPollingSuccess()
})
afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

function setHidden(value: boolean): void {
  Object.defineProperty(document, 'hidden', { value, configurable: true })
}

describe('usePolling', () => {
  it('records the time of each successful fetch for lastPollingSuccessAt()', async () => {
    const start = Date.parse('2026-10-02T10:00:00Z')
    vi.setSystemTime(start)
    const fetcher = vi.fn().mockResolvedValue({ ready: true })
    expect(lastPollingSuccessAt()).toBeNull()
    renderHook(() => usePolling('k-success-at', fetcher, { refreshMs: null }))
    await vi.waitFor(() => expect(lastPollingSuccessAt()).not.toBeNull())
    expect(lastPollingSuccessAt()).toBeGreaterThanOrEqual(start)
  })

  it('steps through the retry ladder while isLoading returns true', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ready: false })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000, isLoading: (d: { ready: boolean }) => !d.ready }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetcher).toHaveBeenCalledTimes(2) // krok drabinki 1

    await vi.advanceTimersByTimeAsync(2000)
    expect(fetcher).toHaveBeenCalledTimes(3) // krok drabinki 2

    await vi.advanceTimersByTimeAsync(3000)
    expect(fetcher).toHaveBeenCalledTimes(4) // krok drabinki 3
  })

  it('never gives up: keeps retrying at refreshMs (or the last ladder step) once the ladder is exhausted', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ready: false })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000, isLoading: (d: { ready: boolean }) => !d.ready }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    // Wyczerpujemy całą drabinkę [1,2,3,5,8,15]s.
    for (const step of [1000, 2000, 3000, 5000, 8000, 15000]) {
      await vi.advanceTimersByTimeAsync(step)
    }
    expect(fetcher).toHaveBeenCalledTimes(7)

    // Drabinka wyczerpana -> wraca do refreshMs, w nieskończoność, nie w ciszę.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(8)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(9)
  })

  it('falls back to the last ladder step when refreshMs is null and the ladder is exhausted', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ready: false })
    renderHook(() => usePolling('k', fetcher, { refreshMs: null, isLoading: () => true }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    for (const step of [1000, 2000, 3000, 5000, 8000, 15000]) {
      await vi.advanceTimersByTimeAsync(step)
    }
    expect(fetcher).toHaveBeenCalledTimes(7)

    await vi.advanceTimersByTimeAsync(15_000) // ostatni krok drabinki, powtórzony
    expect(fetcher).toHaveBeenCalledTimes(8)
  })

  it('keeps the last data after an error and retries at errorRetryMs', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ value: 'first' })
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue({ value: 'second' })
    const { result } = renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000, errorRetryMs: 5_000 }))
    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'first' }))

    await vi.advanceTimersByTimeAsync(30_000) // zaplanowane odświeżenie -> pada
    await vi.waitFor(() => expect(result.current.error).toBe('network down'))
    expect(result.current.data).toEqual({ value: 'first' }) // zachowane, nie wyczyszczone (#7)

    await vi.advanceTimersByTimeAsync(5_000) // errorRetryMs, nie refreshMs
    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'second' }))
    expect(result.current.error).toBeNull()
  })

  it('pauses without fetching while the tab is hidden, with no timer spinning underneath', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    setHidden(true)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Zostaje wstrzymany, nie zaplanowany na ponowne odpalenie sam z siebie.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('fetches immediately when the tab becomes visible again after a paused tick', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    setHidden(true)
    await vi.advanceTimersByTimeAsync(30_000) // zaplanowane odpytanie się wstrzymuje
    expect(fetcher).toHaveBeenCalledTimes(1)

    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  })

  it('fetches on return to the tab when the refresh timer is overdue (suspended standalone app), not before', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    renderHook(() => usePolling('k-overdue', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    // Powrót przed terminem (przełączanie kart): zero zapytań ponad zwykły rytm.
    vi.setSystemTime(Date.now() + 10_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Zawieszona aplikacja: zegar systemowy poszedł naprzód, timer nie odpalił.
    vi.setSystemTime(Date.now() + 60_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))

    // Kolejny powrót zaraz potem nie powtarza zapytania (rytm liczy się od nowa).
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does nothing on visibilitychange when no tick was paused', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    // Karta nigdy nie była ukryta -> nic się nie wstrzymało; visibilitychange nic nie robi.
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('the first fetch after mount always runs even when the tab starts out hidden', async () => {
    setHidden(true)
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  })

  it('resets data and cancels old timers when the key changes', async () => {
    const fetcherA = vi.fn().mockResolvedValue({ value: 'a' })
    const fetcherB = vi.fn().mockResolvedValue({ value: 'b' })
    const { result, rerender } = renderHook(({ key, fetcher }) => usePolling(key, fetcher, { refreshMs: 30_000 }), {
      initialProps: { key: 'a', fetcher: fetcherA },
    })
    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'a' }))

    rerender({ key: 'b', fetcher: fetcherB })
    // Dane starego klucza nigdy nie przeciekają pod nowym kluczem, nawet zanim przyjdzie jego pierwszy wynik.
    expect(result.current.data).toBeNull()
    expect(result.current.lastSuccessAt).toBeNull()

    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'b' }))

    // Timer starego klucza musi zostać anulowany -- upływ czasu już nie woła fetcherA.
    fetcherA.mockClear()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcherA).not.toHaveBeenCalled()
  })

  it('keepPreviousData keeps the old key data until the new key delivers its first result', async () => {
    let resolveB: (v: { value: string }) => void = () => {}
    const fetcherA = vi.fn().mockResolvedValue({ value: 'a' })
    const fetcherB = vi.fn().mockImplementation(() => new Promise((resolve) => (resolveB = resolve)))
    const { result, rerender } = renderHook(
      ({ key, fetcher }) => usePolling(key, fetcher, { refreshMs: 30_000, keepPreviousData: true }),
      { initialProps: { key: 'a', fetcher: fetcherA } }
    )
    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'a' }))
    const successA = result.current.lastSuccessAt

    rerender({ key: 'b', fetcher: fetcherB })
    // Stare dane zostają (bez mrugnięcia widoku), dopóki nie przyjdzie pierwszy wynik nowego klucza.
    expect(result.current.data).toEqual({ value: 'a' })
    expect(result.current.lastSuccessAt).toBe(successA)

    resolveB({ value: 'b' })
    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'b' }))
  })

  it('keepPreviousData keeps the old data with error set when the new key fails first', async () => {
    const fetcherA = vi.fn().mockResolvedValue({ value: 'a' })
    const fetcherB = vi.fn().mockRejectedValue(new Error('boom'))
    const { result, rerender } = renderHook(
      ({ key, fetcher }) => usePolling(key, fetcher, { refreshMs: 30_000, keepPreviousData: true }),
      { initialProps: { key: 'a', fetcher: fetcherA } }
    )
    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'a' }))

    rerender({ key: 'b', fetcher: fetcherB })
    await vi.waitFor(() => expect(result.current.error).toBe('boom'))
    expect(result.current.data).toEqual({ value: 'a' })
  })

  it('keepPreviousData still resets when the key becomes null', async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 'a' })
    const { result, rerender } = renderHook(
      ({ key }: { key: string | null }) => usePolling(key, fetcher, { refreshMs: 30_000, keepPreviousData: true }),
      { initialProps: { key: 'a' as string | null } }
    )
    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'a' }))

    rerender({ key: null })
    await vi.waitFor(() => expect(result.current.data).toBeNull())
  })

  it('without an errorRetryMs a failed fetch retries at refreshMs, not sooner', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue({ ok: true })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 300_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(29_000) // bez błędnego skrótu do 30 s
    expect(fetcher).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(271_000) // razem 300 s
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('refreshMs as a function of the result picks the delay per result; null stops', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ slow: true }).mockResolvedValueOnce({ slow: true }).mockResolvedValue({ slow: false })
    renderHook(() => usePolling('k', fetcher, { refreshMs: (d: { slow: boolean }) => (d.slow ? 300_000 : null) }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(299_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(300_000)
    expect(fetcher).toHaveBeenCalledTimes(3) // wynik `slow: false` -> `null` -> koniec

    await vi.advanceTimersByTimeAsync(600_000)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('a refreshMs function does not drive the error retry: errors retry at errorRetryMs or 30 s', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue({ slow: false })
    renderHook(() => usePolling('k', fetcher, { refreshMs: () => 300_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('a null key means idle: no fetch, data reset', () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    const { result } = renderHook(() => usePolling(null, fetcher, { refreshMs: 30_000 }))
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ data: null, error: null, lastSuccessAt: null })
  })

  it('stops scheduling once isDone returns true', async () => {
    const fetcher = vi.fn().mockResolvedValue({ finished: true })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000, isDone: (d: { finished: boolean }) => d.finished }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).toHaveBeenCalledTimes(1) // żadne kolejne odpytanie w ogóle nie jest zaplanowane
  })

  it('cleans up the timer and the visibilitychange listener on unmount', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    unmount()
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    fetcher.mockClear()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refresh fetches immediately and keeps one timer', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ready: true })
    const { result } = renderHook(() => usePolling('k-refresh', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(10_000)
    result.current.refresh()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(fetcher).toHaveBeenLastCalledWith({ background: false })

    // Zegar liczy od odświeżenia: stary timer (za 20 s) skasowany, nowy za 30 s — dokładnie jeden.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetcher).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('refresh keeps working after a fetcher that throws synchronously', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('sync')
      })
      .mockResolvedValue({ ready: true })
    const { result } = renderHook(() => usePolling('k-sync-throw', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    result.current.refresh()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  })

  it('refresh is ignored while a fetch is in flight', async () => {
    let resolve: (value: { ready: boolean }) => void = () => {}
    const fetcher = vi.fn(() => new Promise<{ ready: boolean }>((r) => (resolve = r)))
    const { result } = renderHook(() => usePolling('k-inflight', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    result.current.refresh()
    expect(fetcher).toHaveBeenCalledTimes(1)
    resolve({ ready: true })

    // Po odpowiedzi dokładnie jeden cykl, nie dwa nakładające się.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    resolve({ ready: true })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
