#!/usr/bin/env -S npx tsx
/**
 * Mierzy zużycie pamięci procesu po wczytaniu żywego feedu GTFS Warszawy
 * (~107 MB, żądania zakresowe) przez tę samą ścieżkę co produkcja
 * (`createLiveClient` + `loadSchedule`). Zero mocków — realny rozmiar
 * `GtfsSchedule` w pamięci. Sieć: tak (celowo, tylko na żądanie).
 *
 * Uruchomienie (z katalogu repo, node ≥ 22 ma natywne wsparcie TS, ale
 * potrzebujemy `--expose-gc` + rozwiązywania aliasu `@/` z tsconfig.json,
 * stąd tsx):
 *
 *   npx tsx --expose-gc scripts/measure-gtfs-memory.mjs
 *
 * Wypisuje `process.memoryUsage()` (RSS, heap, arrayBuffers) po
 * dwukrotnym wymuszonym GC, zaraz po `loadSchedule()`, a potem ponownie po
 * wywołaniu kilku gorących ścieżek odczytu (`cityStats`, `searchStops`) —
 * te dokładają WeakMap-owe memo, więc drugi odczyt pokazuje ich koszt.
 */
import { getCity } from '../src/lib/gtfs/cities.ts'
import { createLiveClient } from '../src/lib/gtfs/client.ts'
import { loadSchedule } from '../src/lib/gtfs/loader.ts'
import { cityStats, searchStops } from '../src/lib/gtfs/query.ts'

if (typeof global.gc !== 'function') {
  console.error('Uruchom z --expose-gc: npx tsx --expose-gc scripts/measure-gtfs-memory.mjs')
  process.exit(1)
}

function snapshot(label) {
  global.gc()
  global.gc()
  const m = process.memoryUsage()
  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1)
  console.log(
    `${label}: rss=${mb(m.rss)}MB heapTotal=${mb(m.heapTotal)}MB heapUsed=${mb(m.heapUsed)}MB ` +
      `external=${mb(m.external)}MB arrayBuffers=${mb(m.arrayBuffers)}MB`
  )
  return m
}

const city = getCity('warszawa')
if (city === null) throw new Error('brak miasta warszawa w rejestrze')

snapshot('baseline (przed ładowaniem)')

// `createLiveClient`'s default fetch aborts each range request after 30 s
// (production guard against a stalled feed, `client.ts` GTFS_FETCH_TIMEOUT_MS)
// -- too short for a single 107 MB range read over a slow link. This script
// is a manual one-off measurement, not the guarded production path, so it
// ignores the signal instead of stalling forever.
const client = createLiveClient(city, { fetch: (url, headers) => fetch(url, { headers }) })
const t0 = performance.now()
const schedule = await loadSchedule(client, city, { onPhase: (phase) => console.error(`  faza: ${phase}`) })
const loadMs = performance.now() - t0
console.log(`load: ${(loadMs / 1000).toFixed(1)}s, evCount=${schedule.evCount}, runCount=${schedule.runCount}, stops=${schedule.stopIds.length}, trips=${schedule.tripIds.length}`)

snapshot('po loadSchedule()')

// Gorące ścieżki — dokładają WeakMap-owe memo (cityStats, normalizedStopsFor).
cityStats(schedule, 1)
searchStops(schedule, 'Centrum', 20)
searchStops(schedule, 'Dworzec', 20)

snapshot('po cityStats + searchStops (memo dogrzane)')
