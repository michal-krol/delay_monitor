/**
 * Orkiestracja wczytania rozkładu jednego miasta: wpisy feedu → `buildSchedule`.
 * Zależy od INTERFEJSU `GtfsClient`, nie od implementacji (live/mock).
 *
 * Kolejność wpisów jest wymuszona zależnościami (filtr `stop_times` potrzebuje
 * `trips`, te — kalendarza). `feed_info.txt` czytany dwa razy: wartość otwarcia
 * i po wszystkim — muszą być równe, inaczej feed zregenerował się w trakcie
 * i offsety wskazały śmieci → odrzucamy całe ładowanie (`current` nietknięty).
 */
import type { z } from 'zod'
import { serviceDateWindow } from '@/lib/pkp/time'
import type { CityFeed } from './cities'
import type { GtfsClient } from './client'
import { parseCsvLine, stripBom } from './csv'
import {
  attributionSchema,
  calendarDateSchema,
  calendarSchema,
  frequencySchema,
  routeSchema,
  stopSchema,
  tripSchema,
} from './schema'
import { buildSchedule } from './schedule'
import type { GtfsSchedule } from './types'

export class FeedChangedDuringLoadError extends Error {
  constructor(before: string | null, after: string | null) {
    super(`feed_version zmienił się w trakcie ładowania (${before ?? 'null'} → ${after ?? 'null'}) — feed zregenerowany, ładowanie odrzucone.`)
    this.name = 'FeedChangedDuringLoadError'
  }
}

async function parseRows<T>(client: GtfsClient, name: string, schema: z.ZodType<T>): Promise<T[]> {
  const stream = await client.readEntry(name)
  if (stream === null) return []

  const rows: T[] = []
  let header: string[] | null = null
  for await (const rawLine of stream) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line === '') continue
    if (header === null) {
      header = parseCsvLine(stripBom(line)).map((name) => name.trim())
      continue
    }
    const cells = line.includes('"') ? parseCsvLine(line) : line.split(',')
    const record: Record<string, string> = {}
    header.forEach((key, index) => {
      record[key] = cells[index] ?? ''
    })
    const parsed = schema.safeParse(record)
    if (parsed.success) rows.push(parsed.data)
  }
  return rows
}

export async function loadSchedule(client: GtfsClient, city: CityFeed, now: Date = new Date()): Promise<GtfsSchedule> {
  const serviceDates = serviceDateWindow(now, city.timezone)

  // 1. feed_info — wartość otwarcia
  const feedVersionBefore = await client.getFeedVersion()

  // 2-6. wpisy przez Zod (kolejność wymuszona zależnościami)
  const [calendars, calendarDates, stops, routes, trips, frequencies, attributions] = await Promise.all([
    parseRows(client, 'calendar.txt', calendarSchema),
    parseRows(client, 'calendar_dates.txt', calendarDateSchema),
    parseRows(client, 'stops.txt', stopSchema),
    parseRows(client, 'routes.txt', routeSchema),
    parseRows(client, 'trips.txt', tripSchema),
    parseRows(client, 'frequencies.txt', frequencySchema),
    parseRows(client, 'attributions.txt', attributionSchema),
  ])

  // 7. stop_times — strumieniowo, poza Zod (patrz nagłówek schedule.ts)
  const stopTimeStream = await client.readEntry('stop_times.txt')
  if (stopTimeStream === null) throw new Error('Brak stop_times.txt w feedzie GTFS.')

  const schedule = await buildSchedule({
    feedVersion: feedVersionBefore,
    serviceDates,
    timezone: city.timezone,
    attribution: attributions.filter((name): name is string => name !== null && name !== ''),
    routes,
    stops,
    trips,
    frequencies,
    calendars,
    calendarDates,
    stopTimeLines: stopTimeStream,
  })

  // 8. feed_info — musi się równać krokowi 1
  const feedVersionAfter = await client.getFeedVersion()
  if (feedVersionAfter !== feedVersionBefore) {
    throw new FeedChangedDuringLoadError(feedVersionBefore, feedVersionAfter)
  }

  return schedule
}
