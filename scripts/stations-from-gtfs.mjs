#!/usr/bin/env node
/**
 * Współrzędne stacji PKP z `polish_trains.zip` (Mikołaj Kuranowski, dane PKP PLK
 * i KM) → `data/station-coordinates.json`, `source: "gtfs"` + `tier` (1–3).
 *
 * Zastępuje centroidy miejscowości (`city-fallback`) prawdziwą pozycją stacji —
 * `stop_id` stacji-rodzica w tym feedzie to ID PKP PLK (patrz
 * `lib/gtfsStations.mjs`). Jak `enrich-station-coords.mjs`: uruchamiany ręcznie,
 * wynik commitowany, runtime czyta plik statycznie (zero ruchu sieciowego).
 *
 * Uruchomienie (Node ≥ 23.6 — importuje helpery ZIP/CSV aplikacji z `.ts`):
 *   node scripts/stations-from-gtfs.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findEndOfCentralDirectory, parseCentralDirectory, localDataOffset } from '../src/lib/gtfs/zip.ts'
import { headerIndex, parseCsvLine, field } from '../src/lib/gtfs/csv.ts'
import { mergeGtfsStations } from './lib/gtfsStations.mjs'

const FEED_URL = 'https://mkuran.pl/gtfs/polish_trains.zip'
const OUTPUT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'station-coordinates.json')

function readEntry(zip, entries, name) {
  const entry = entries.find((candidate) => candidate.name === name)
  if (entry === undefined) throw new Error(`Brak ${name} w archiwum`)
  const start = localDataOffset(zip.subarray(entry.localHeaderOffset), entry.localHeaderOffset)
  const data = zip.subarray(start, start + entry.compressedSize)
  return (entry.method === 0 ? data : inflateRawSync(data)).toString('utf8')
}

function* rows(text) {
  const lines = text.split('\n')
  const index = headerIndex(lines[0])
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() !== '') yield [parseCsvLine(lines[i]), index]
  }
}

const response = await fetch(FEED_URL)
if (!response.ok) throw new Error(`${FEED_URL}: HTTP ${response.status}`)
const zip = Buffer.from(await response.arrayBuffer())
const eocd = findEndOfCentralDirectory(zip.subarray(Math.max(0, zip.length - 65_557)))
const entries = parseCentralDirectory(zip.subarray(eocd.centralDirectoryOffset))

const stations = []
const parentOf = new Map()
for (const [row, index] of rows(readEntry(zip, entries, 'stops.txt'))) {
  const id = field(row, index, 'stop_id')
  const parent = field(row, index, 'parent_station')
  parentOf.set(id, parent || id)
  if (field(row, index, 'location_type') !== '1') continue
  const lat = Number(field(row, index, 'stop_lat'))
  const lon = Number(field(row, index, 'stop_lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue
  stations.push({
    id,
    secondaryId: field(row, index, 'plk_secondary_id'),
    lat,
    lon,
  })
}

const events = new Map()
for (const [row, index] of rows(readEntry(zip, entries, 'stop_times.txt'))) {
  const station = parentOf.get(field(row, index, 'stop_id'))
  if (station !== undefined) events.set(station, (events.get(station) ?? 0) + 1)
}

const existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'))
const { merged, updated } = mergeGtfsStations(stations, events, existing)
writeFileSync(OUTPUT_PATH, `${JSON.stringify(merged, null, 2)}\n`)

const bySource = {}
for (const entry of Object.values(merged)) bySource[entry.source] = (bySource[entry.source] ?? 0) + 1
console.log(`Stacje w feedzie: ${stations.length}, zaktualizowane: ${updated}`)
console.log('Źródła po scaleniu:', bySource)
