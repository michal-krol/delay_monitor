#!/usr/bin/env node
/**
 * Jednorazowe wzbogacenie listy stacji PLK o współrzędne geograficzne.
 *
 * Nie jest częścią aplikacji ani cyklu pollera — uruchamiane ręcznie, raz
 * (dane się prawie nie zmieniają). Wynik trafia do data/station-coordinates.json
 * i stamtąd runtime go czyta statycznie, zero zapytań sieciowych na produkcji.
 *
 * Precyzja stacji nie jest celem -- interesuje nas pogoda dla miejscowości,
 * nie dla konkretnego punktu na peronie. Dlatego jedna ścieżka: zapytanie do
 * Nominatim (OSM) o pełną nazwę stacji, a jeśli brak wyniku -- obcinanie
 * końcowych słów aż do trafienia w cokolwiek ("Warszawa Ochota" ->
 * "Warszawa"). Dla nazw jednoczłonowych (sama miejscowość) to i tak trafia
 * za pierwszym razem. Brak wyniku nawet dla samej miejscowości -> stacja
 * trafia do listy "failed" w podsumowaniu, do ręcznego dociągnięcia.
 *
 * Znane ograniczenie: dopasowanie idzie po samej nazwie, więc dwie
 * miejscowości o identycznej nazwie (w Polsce się zdarza, np. dwie wsie
 * "Wiekowo") są nierozróżnialne -- brany jest pierwszy wynik wg rankingu
 * Nominatima. Dla pogody w skali miasta błąd rzędu innej miejscowości o tej
 * samej nazwie to wciąż dziesiątki km, nie setki -- nieopłacalne do
 * automatycznego rozwiązywania teraz.
 *
 * Uruchomienie:
 *   PKP_API_KEY=xxx node scripts/enrich-station-coords.mjs
 *
 * Wznawialne: już rozwiązane stacje (lat !== null) w istniejącym pliku
 * wyjściowym są pomijane przy kolejnym uruchomieniu.
 *
 * Uwaga: to publiczny darmowy Nominatim (nominatim.openstreetmap.org),
 * limit 1 zapytanie/s pilnowany poniżej. Dla ~9000 stacji to kilka godzin
 * jednorazowo -- nie uruchamiaj tego w pętli/cron, tylko raz i cachuj wynik.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { matchStationName } from './lib/stationNameMatch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'station-coordinates.json')
const PLK_BASE_URL = 'https://pdp-api.plk-sa.pl'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const OVERPASS_RADIUS_M = 5000
// Nominatim wymaga identyfikującego User-Agent (polityka OSM) -- podmień na
// swój kontakt, jeśli uruchamiasz to poza jednorazowym developmentem.
const USER_AGENT = 'delay-monitor-station-coords-script/1.0 (one-off enrichment run)'
const RATE_LIMIT_MS = 1100

const apiKey = process.env.PKP_API_KEY
if (!apiKey) {
  console.error('Brak PKP_API_KEY w środowisku.')
  process.exit(1)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchStations() {
  const url = `${PLK_BASE_URL}/api/v1/dictionaries/stations?pageSize=10000`
  const res = await fetch(url, { headers: { 'X-API-Key': apiKey } })
  if (!res.ok) {
    throw new Error(`Pobranie listy stacji nie powiodło się: ${res.status} ${res.statusText}`)
  }
  const body = await res.json()
  return body.stations.filter((s) => s.name !== '')
}

async function nominatimSearch(query) {
  const params = new URLSearchParams({ q: query, format: 'json', countrycodes: 'pl', limit: '1' })
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!res.ok) {
    // 429/5xx -- traktuj jak brak wyniku dla tej próby, nie przerywaj całego biegu.
    console.warn(`  Nominatim ${res.status} dla "${query}"`)
    return null
  }
  const results = await res.json()
  return results[0] ?? null
}

/** Obcina końcowe słowo po słowie, aż Nominatim znajdzie cokolwiek -- precyzja stacji nie jest celem. */
async function geocodeWithFallback(name) {
  const words = name.split(' ')
  for (let cut = 0; cut < words.length; cut++) {
    const query = words.slice(0, words.length - cut).join(' ')
    if (query.length < 2) break
    if (cut > 0) await sleep(RATE_LIMIT_MS)
    const hit = await nominatimSearch(query)
    if (hit) {
      return {
        lat: Number(hit.lat),
        lon: Number(hit.lon),
        source: hit.class === 'railway' ? 'station' : 'city-fallback',
      }
    }
  }

  return { lat: null, lon: null, source: 'failed' }
}

/**
 * Węzły kolejowe (stacja/przystanek) w promieniu wokół już znanej
 * współrzędnej miejscowości (fallback z pierwszego przebiegu). Overpass jest
 * publiczny, bez klucza -- ten sam duch rate-limitu co Nominatim wyżej, nie
 * uruchamiać w pętli/cron.
 */
async function overpassSearch(lat, lon) {
  const query = `[out:json][timeout:25];node["railway"~"station|halt"](around:${OVERPASS_RADIUS_M},${lat},${lon});out;`
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': USER_AGENT },
    body: query,
  })
  if (!res.ok) {
    console.warn(`  Overpass ${res.status} dla (${lat}, ${lon})`)
    return []
  }
  const body = await res.json()
  return body.elements
    .filter((el) => el.tags?.name)
    .map((el) => ({ name: el.tags.name, lat: el.lat, lon: el.lon }))
}

function loadExisting() {
  if (!existsSync(OUTPUT_PATH)) return {}
  try {
    return JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function save(result) {
  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf-8')
}

/**
 * Drugi przebieg: dla wpisów, którym pierwszy przebieg (Nominatim, wyżej) nie
 * dał realnej stacji (`city-fallback`/`failed`), szuka węzła kolejowego w
 * Overpass wokół już znanej współrzędnej miejscowości. Ten sam plik wynikowy,
 * ta sama zasada wznawialności: pomija wpisy już `source: 'osm-railway'`.
 */
async function upgradeFallbackEntries() {
  const result = loadExisting()
  const todo = Object.entries(result).filter(([, entry]) => entry.source === 'city-fallback' || entry.source === 'failed')
  console.log(`Do ulepszenia (city-fallback/failed): ${todo.length}`)

  let upgraded = 0
  for (let i = 0; i < todo.length; i += 1) {
    const [id, entry] = todo[i]
    if (entry.lat !== null && entry.lon !== null) {
      const candidates = await overpassSearch(entry.lat, entry.lon)
      const match = matchStationName(candidates, entry.name)
      if (match !== null) {
        result[id] = { name: entry.name, lat: match.lat, lon: match.lon, source: 'osm-railway' }
        upgraded += 1
      }
    }

    if (i % 25 === 0 || i === todo.length - 1) {
      save(result)
      console.log(`[${i + 1}/${todo.length}] ${entry.name} -> ${result[id].source}`)
    }
    await sleep(RATE_LIMIT_MS)
  }

  save(result)
  console.log(`\n--- Podsumowanie ulepszenia ---`)
  console.log(`Ulepszonych do 'osm-railway': ${upgraded}/${todo.length}`)
}

async function main() {
  const stations = await fetchStations()
  console.log(`Stacji z PLK: ${stations.length}`)

  const result = loadExisting()
  const todo = stations.filter((s) => result[s.id]?.lat == null)
  console.log(`Już rozwiązanych (pominięte): ${stations.length - todo.length}`)
  console.log(`Do zrobienia: ${todo.length} (~${Math.ceil((todo.length * RATE_LIMIT_MS) / 60000)} min)`)

  for (let i = 0; i < todo.length; i++) {
    const station = todo[i]
    const geo = await geocodeWithFallback(station.name)
    result[station.id] = { name: station.name, ...geo }

    if (i % 25 === 0 || i === todo.length - 1) {
      save(result)
      console.log(`[${i + 1}/${todo.length}] ${station.name} -> ${geo.source}`)
    }

    await sleep(RATE_LIMIT_MS)
  }

  save(result)

  const values = Object.values(result)
  const byStation = values.filter((v) => v.source === 'station').length
  const byCity = values.filter((v) => v.source === 'city-fallback').length
  const failed = values.filter((v) => v.source === 'failed')

  console.log('\n--- Podsumowanie ---')
  console.log(`Razem: ${values.length}`)
  console.log(`Dopasowane po stacji: ${byStation}`)
  console.log(`Fallback do miejscowości: ${byCity}`)
  console.log(`Nie udało się: ${failed.length}`)
  if (failed.length > 0) {
    console.log('Nierozwiązane nazwy:')
    for (const f of failed) console.log(`  - ${f.name}`)
  }
  console.log(`\nZapisano do ${OUTPUT_PATH}`)
}

const mode = process.argv.includes('--upgrade-fallback') ? 'upgrade' : 'geocode'
const run = mode === 'upgrade' ? upgradeFallbackEntries : main
run().catch((err) => {
  console.error(err)
  process.exit(1)
})
