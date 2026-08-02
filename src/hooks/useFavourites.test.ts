// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useFavourites } from './useFavourites'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useFavourites', () => {
  it('starts empty and marks loaded after the initial effect', async () => {
    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.favourites).toEqual([])
  })

  it('adds a favourite and persists it to localStorage', async () => {
    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.addFavourite({ id: '5100', name: 'Warszawa Centralna' }))

    expect(result.current.favourites).toEqual([{ id: '5100', name: 'Warszawa Centralna' }])
    expect(JSON.parse(window.localStorage.getItem('pkp.favourites.v1') ?? '[]')).toEqual([
      { id: '5100', name: 'Warszawa Centralna' },
    ])
  })

  it('does not add a duplicate id', async () => {
    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.addFavourite({ id: '5100', name: 'Warszawa Centralna' }))
    act(() => result.current.addFavourite({ id: '5100', name: 'Warszawa Centralna' }))

    expect(result.current.favourites).toHaveLength(1)
  })

  it('removes a favourite', async () => {
    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.addFavourite({ id: '5100', name: 'Warszawa Centralna' }))
    act(() => result.current.removeFavourite('5100'))

    expect(result.current.favourites).toEqual([])
  })

  it('reads previously persisted favourites on mount', async () => {
    window.localStorage.setItem('pkp.favourites.v1', JSON.stringify([{ id: '5136', name: 'Kraków Główny' }]))
    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.favourites).toEqual([{ id: '5136', name: 'Kraków Główny' }])
  })

  it('recovers from a corrupted localStorage entry instead of crashing', async () => {
    // JSON.parse zwraca cokolwiek, a asercja typu tego nie sprawdza. Kazdy z tych
    // ksztaltow przechodzil dalej i wywracal render (`favourites.map` na
    // nie-tablicy), czyli dawal biala strone wbrew zasadzie "UI nigdy nie jest
    // pusty" — a uzytkownik nie ma jak tego naprawic bez narzedzi deweloperskich.
    const corrupted = [
      'to nie jest JSON',
      '{"a":1}',
      'null',
      '"napis"',
      '42',
      '[{"id":123,"name":"Liczbowe id"}]',
      '[{"id":"5100"}]',
      '[{"name":"Bez id"}]',
      '[null]',
      '[[]]',
    ]

    for (const raw of corrupted) {
      window.localStorage.setItem('pkp.favourites.v1', raw)
      const { result, unmount } = renderHook(() => useFavourites())
      await waitFor(() => expect(result.current.loaded).toBe(true))

      expect(Array.isArray(result.current.favourites), `wejscie: ${raw}`).toBe(true)
      for (const favourite of result.current.favourites) {
        expect(typeof favourite.id, `wejscie: ${raw}`).toBe('string')
        expect(typeof favourite.name, `wejscie: ${raw}`).toBe('string')
      }
      unmount()
    }
  })

  it('keeps the valid entries when only some are corrupted', async () => {
    window.localStorage.setItem(
      'pkp.favourites.v1',
      JSON.stringify([{ id: '5100', name: 'Warszawa Centralna' }, null, { id: 7 }, { id: '4900', name: 'Wrocław Główny' }])
    )

    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.favourites).toEqual([
      { id: '5100', name: 'Warszawa Centralna' },
      { id: '4900', name: 'Wrocław Główny' },
    ])
  })
})
