/**
 * Czysta logika `scripts/stations-from-gtfs.mjs` — bez I/O, testowalna.
 *
 * `polish_trains.zip` (mkuran) ma `stop_id` stacji-rodzica (`location_type=1`)
 * RÓWNY ID stacji w API PKP PLK, a `plk_secondary_id` niesie starszy/alternatywny
 * ID tej samej stacji (np. Warszawa Praga: 201092 / 36129). Dopasowanie po ID,
 * nie po nazwie — zero heurystyk.
 */

/**
 * Progi rangi (po liczbie zdarzeń zatrzymania w całym feedzie) → `tier`.
 * Tier 1 = węzły widoczne na mapie kraju, 2 = od zoomu regionu, 3 = reszta.
 * Ranga, nie próg bezwzględny — feed obejmuje zmienną liczbę dni.
 */
export const TIER_RANKS = { tier1: 80, tier2: 500 }

/**
 * Nadpisuje WYŁĄCZNIE wpisy już obecne w pliku (klucz = ID ze słownika PLK).
 * Stacje spoza pliku są pomijane — feed ma też ID spoza PLK (np. `0` = Lotnisko
 * Modlin z KM), które nie otworzą tablicy.
 *
 * @param {Array<{ id: string, secondaryId: string, lat: number, lon: number }>} stations
 * @param {Map<string, number>} eventsByStation  zdarzenia `stop_times` zsumowane do stacji-rodzica
 * @param {Record<string, { name: string, lat: number|null, lon: number|null, source: string, tier?: number }>} existing
 * @returns {{ merged: typeof existing, updated: number }}
 */
export function mergeGtfsStations(stations, eventsByStation, existing) {
  const ranked = [...stations].sort((a, b) => (eventsByStation.get(b.id) ?? 0) - (eventsByStation.get(a.id) ?? 0))
  const tierOf = new Map(
    ranked.map((station, index) => [station.id, index < TIER_RANKS.tier1 ? 1 : index < TIER_RANKS.tier2 ? 2 : 3])
  )

  const merged = { ...existing }
  let updated = 0
  for (const station of stations) {
    const entry = { lat: round6(station.lat), lon: round6(station.lon), source: 'gtfs', tier: tierOf.get(station.id) }
    const keys = [station.id, station.secondaryId].filter((key) => key !== '')
    for (const key of keys) {
      if (merged[key] === undefined) continue
      merged[key] = { name: merged[key].name, ...entry }
      updated += 1
    }
  }
  return { merged, updated }
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6
}
