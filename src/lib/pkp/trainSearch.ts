import { normalizeForSearch } from '@/lib/search'
import { OPERATING_DATE_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'
import type { RawRoute } from './types'

export type TrainSearchHit = {
  scheduleId: string
  orderId: string
  operatingDate: string
  name: string | null
  nationalNumber: string | null
  origin: string | null
  destination: string | null
}
export type TrainSearchResult = { trains: TrainSearchHit[]; state: 'ready' | 'unavailable' }
export type TrainSearchIndex = ReturnType<typeof createTrainSearchIndex>

/** Trigram postings narrow substring queries without scanning the national route list per keystroke. */
export function createTrainSearchIndex(routes: RawRoute[], stationNames: Record<string, string>) {
  const entries: Array<{ hit: TrainSearchHit; number: string; name: string }> = []
  const postings = new Map<string, number[]>()
  const seen = new Set<string>()
  for (const route of routes) {
    if (!STATION_ID_PATTERN.test(route.scheduleId) || !STATION_ID_PATTERN.test(route.orderId)) continue
    const number = normalizeForSearch(route.nationalNumber ?? '')
    const name = normalizeForSearch(route.name ?? '')
    const grams = new Set<string>()
    for (const text of [number, name]) {
      for (let i = 0; i <= text.length - 3; i++) grams.add(text.slice(i, i + 3))
    }
    for (const operatingDate of route.operatingDates) {
      if (!OPERATING_DATE_PATTERN.test(operatingDate)) continue
      const key = `${route.scheduleId}|${route.orderId}|${operatingDate}`
      if (seen.has(key)) continue
      seen.add(key)
      const index = entries.length
      entries.push({ number, name, hit: {
        scheduleId: route.scheduleId, orderId: route.orderId, operatingDate,
        name: route.name, nationalNumber: route.nationalNumber,
        origin: stationNames[route.stations[0]?.stationId] ?? null,
        destination: stationNames[route.stations.at(-1)?.stationId ?? ''] ?? null,
      } })
      for (const gram of grams) {
        const bucket = postings.get(gram)
        if (bucket === undefined) postings.set(gram, [index])
        else bucket.push(index)
      }
    }
  }
  return {
    search(query: string, dateFrom: string, dateTo: string): TrainSearchHit[] {
      const needle = normalizeForSearch(query)
      if (needle.length < 3 || needle.length > 100) return []
      const rank = (entry: typeof entries[number]) => entry.number === needle ? 0 : entry.number.startsWith(needle) ? 1 : 2
      return (postings.get(needle.slice(0, 3)) ?? [])
        .map((index) => entries[index])
        .filter(({ hit, number, name }) => hit.operatingDate >= dateFrom && hit.operatingDate <= dateTo && (number.includes(needle) || name.includes(needle)))
        .sort((a, b) => rank(a) - rank(b) || a.hit.operatingDate.localeCompare(b.hit.operatingDate) || a.number.localeCompare(b.number, 'pl', { numeric: true }) || a.hit.orderId.localeCompare(b.hit.orderId, 'pl', { numeric: true }))
        .slice(0, 8)
        .map(({ hit }) => hit)
    },
  }
}
