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
})
