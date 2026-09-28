// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { favouriteKey, useFavourites, type Favourite } from './useFavourites'

const V1_KEY = 'pkp.favourites.v1'
const V2_KEY = 'monitor.favourites.v2'

const WAW: Favourite = { kind: 'pkp', id: '5100', name: 'Warszawa Centralna' }
const KRK: Favourite = { kind: 'pkp', id: '5136', name: 'Kraków Główny' }
const METRO: Favourite = { kind: 'gtfs', city: 'warszawa', id: '7014M', name: 'Świętokrzyska' }

function readV2(): unknown {
  return JSON.parse(window.localStorage.getItem(V2_KEY) ?? 'null')
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('useFavourites', () => {
  it('starts empty and marks loaded after the initial effect', async () => {
    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.favourites).toEqual([])
  })

  it('adds a favourite and persists it to the v2 key', async () => {
    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.addFavourite(WAW))

    expect(result.current.favourites).toEqual([WAW])
    expect(readV2()).toEqual([WAW])
  })

  it('stores a gtfs favourite with city as a separate field', async () => {
    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.addFavourite(METRO))

    expect(readV2()).toEqual([METRO])
    expect(result.current.isFavourite(favouriteKey(METRO))).toBe(true)
  })

  it('treats same id in different cities as distinct entries', async () => {
    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    const wawStop: Favourite = { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Rondo' }
    const krkStop: Favourite = { kind: 'gtfs', city: 'krakow', id: '1001', name: 'Rynek' }
    act(() => result.current.addFavourite(wawStop))
    act(() => result.current.addFavourite(krkStop))

    expect(result.current.favourites).toHaveLength(2)
  })

  it('does not add a duplicate key', async () => {
    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.addFavourite(WAW))
    act(() => result.current.addFavourite({ ...WAW, name: 'inna nazwa' }))

    expect(result.current.favourites).toHaveLength(1)
  })

  it('removes a favourite by key', async () => {
    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.addFavourite(WAW))
    act(() => result.current.removeFavourite(favouriteKey(WAW)))

    expect(result.current.favourites).toEqual([])
    // Usunięcie ostatniego wpisu utrwala pusty klucz v2 — kolejny odczyt nie
    // wskrzesza starych danych.
    expect(readV2()).toEqual([])
  })
})

describe('useFavourites — stary klucz v1', () => {
  it('ignores data only under the old v1 key (empty list, no crash)', async () => {
    window.localStorage.setItem(V1_KEY, JSON.stringify([{ id: '5136', name: 'Kraków Główny' }]))

    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.favourites).toEqual([])
  })
})

describe('useFavourites — wrogie wejście z localStorage', () => {
  it('recovers from a corrupted v2 entry instead of crashing', async () => {
    const corrupted = ['to nie jest JSON', '{"a":1}', 'null', '"napis"', '42', '[[]]']

    for (const raw of corrupted) {
      window.localStorage.setItem(V2_KEY, raw)
      const { result, unmount } = renderHook(() => useFavourites())
      await waitFor(() => expect(result.current.loaded).toBe(true))
      expect(Array.isArray(result.current.favourites), `wejscie: ${raw}`).toBe(true)
      unmount()
    }
  })

  it('drops entries with an unknown or malformed kind, keeps the valid ones', async () => {
    window.localStorage.setItem(
      V2_KEY,
      JSON.stringify([
        WAW,
        { kind: 'tram', id: '1', name: 'X' }, // nieznany wariant
        { kind: 'gtfs', id: '1001', name: 'Bez miasta' }, // brak wymaganego `city`
        { kind: 'pkp', id: 7, name: 'Liczbowe id' }, // zły typ
        null,
        METRO,
      ])
    )

    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.favourites).toEqual([WAW, METRO])
  })

  it('favourite with malformed station id is dropped, others kept', async () => {
    window.localStorage.setItem(
      V2_KEY,
      JSON.stringify([WAW, { kind: 'pkp', id: 'nie-liczba', name: 'Zły id' }, KRK])
    )

    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.favourites).toEqual([WAW, KRK])
  })

  it('gtfs favourite with bad city dropped', async () => {
    window.localStorage.setItem(
      V2_KEY,
      JSON.stringify([METRO, { kind: 'gtfs', city: 'Warszawa123', id: '7014M', name: 'Zła stolica' }])
    )

    const { result } = renderHook(() => useFavourites())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.favourites).toEqual([METRO])
  })
})
