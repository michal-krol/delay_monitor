// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { pinnedKey, usePinned, type PinnedItem } from './usePinned'

const V1_KEY = 'pkp.favourites.v1'
const V2_KEY = 'monitor.favourites.v2'

const WAW: PinnedItem = { kind: 'pkp', id: '5100', name: 'Warszawa Centralna' }
const KRK: PinnedItem = { kind: 'pkp', id: '5136', name: 'Kraków Główny' }
const METRO: PinnedItem = { kind: 'gtfs', city: 'warszawa', id: '7014M', name: 'Świętokrzyska' }

function readV2(): unknown {
  return JSON.parse(window.localStorage.getItem(V2_KEY) ?? 'null')
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('usePinned', () => {
  it('starts empty and marks loaded after the initial effect', async () => {
    const { result } = renderHook(() => usePinned())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.pinnedItems).toEqual([])
  })

  it('adds a pinned item and persists it to the v2 key', async () => {
    const { result } = renderHook(() => usePinned())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.addPinned(WAW))

    expect(result.current.pinnedItems).toEqual([WAW])
    expect(readV2()).toEqual([WAW])
  })

  it('stores a gtfs pinned item with city as a separate field', async () => {
    const { result } = renderHook(() => usePinned())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.addPinned(METRO))

    expect(readV2()).toEqual([METRO])
    expect(result.current.isPinned(pinnedKey(METRO))).toBe(true)
  })

  it('treats same id in different cities as distinct entries', async () => {
    const { result } = renderHook(() => usePinned())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    const wawStop: PinnedItem = { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Rondo' }
    const krkStop: PinnedItem = { kind: 'gtfs', city: 'krakow', id: '1001', name: 'Rynek' }
    act(() => result.current.addPinned(wawStop))
    act(() => result.current.addPinned(krkStop))

    expect(result.current.pinnedItems).toHaveLength(2)
  })

  it('does not add a duplicate key', async () => {
    const { result } = renderHook(() => usePinned())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.addPinned(WAW))
    act(() => result.current.addPinned({ ...WAW, name: 'inna nazwa' }))

    expect(result.current.pinnedItems).toHaveLength(1)
  })

  it('removes a pinned item by key', async () => {
    const { result } = renderHook(() => usePinned())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.addPinned(WAW))
    act(() => result.current.removePinned(pinnedKey(WAW)))

    expect(result.current.pinnedItems).toEqual([])
    // Usunięcie ostatniego wpisu utrwala pusty klucz v2 — kolejny odczyt nie
    // wskrzesza starych danych.
    expect(readV2()).toEqual([])
  })
})

describe('usePinned — stary klucz v1', () => {
  it('ignores data only under the old v1 key (empty list, no crash)', async () => {
    window.localStorage.setItem(V1_KEY, JSON.stringify([{ id: '5136', name: 'Kraków Główny' }]))

    const { result } = renderHook(() => usePinned())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.pinnedItems).toEqual([])
  })
})

describe('usePinned — wrogie wejście z localStorage', () => {
  it('recovers from a corrupted v2 entry instead of crashing', async () => {
    const corrupted = ['to nie jest JSON', '{"a":1}', 'null', '"napis"', '42', '[[]]']

    for (const raw of corrupted) {
      window.localStorage.setItem(V2_KEY, raw)
      const { result, unmount } = renderHook(() => usePinned())
      await waitFor(() => expect(result.current.loaded).toBe(true))
      expect(Array.isArray(result.current.pinnedItems), `wejscie: ${raw}`).toBe(true)
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

    const { result } = renderHook(() => usePinned())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.pinnedItems).toEqual([WAW, METRO])
  })

  it('pinned item with malformed station id is dropped, others kept', async () => {
    window.localStorage.setItem(
      V2_KEY,
      JSON.stringify([WAW, { kind: 'pkp', id: 'nie-liczba', name: 'Zły id' }, KRK])
    )

    const { result } = renderHook(() => usePinned())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.pinnedItems).toEqual([WAW, KRK])
  })

  it('gtfs pinned item with bad city dropped', async () => {
    window.localStorage.setItem(
      V2_KEY,
      JSON.stringify([METRO, { kind: 'gtfs', city: 'Warszawa123', id: '7014M', name: 'Zła stolica' }])
    )

    const { result } = renderHook(() => usePinned())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.pinnedItems).toEqual([METRO])
  })
})
