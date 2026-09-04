/**
 * Serce podprojektu: parsowane wiersze GTFS → kolumnowy `GtfsSchedule`
 * w pamięci. Czysty — zero I/O, zero sieci. `loader.ts` / `mock.ts` dostarczają
 * wiersze, tutaj powstają tablice typowane, rozwinięcie `frequencies` i indeks CSR.
 *
 * ── JAWNY WYJĄTEK OD KONWENCJI REPO ──────────────────────────────────────────
 * `stop_times.txt` OMIJA Zod. Uruchomienie schematu na 7,95 mln wierszy
 * zamieniłoby przelot 3-sekundowy w minutowy. W zamian dostaje jawne strażniki
 * (`parseGtfsSeconds()` → `null` na czymkolwiek poza `H+:MM:SS`, wiersz
 * odrzucany) oraz licznik `droppedStopTimes`. Pozostałe pliki idą przez Zod
 * normalnie (`schema.ts`). NIE „naprawiać" tego przez dołożenie Zod tutaj.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Tablice EVENTów (miliony wierszy) rosną przez podwajanie typowanych buforów.
 * Tablice na poziomie KURSU (~100k) są zwykłymi tablicami JS w trakcie budowy
 * (losowy dostęp przy rozwijaniu `frequencies`), sprowadzane do typowanych na
 * końcu — 100k intów jako `number[]` to ~0,8 MB, nie warto komplikować.
 */
import { serviceDayNoonEpoch } from '@/lib/pkp/time'
import { headerIndex, parseCsvLine } from './csv'
import { parseGtfsSeconds, serviceCategory, type ServiceCategory } from './schema'
import type { GtfsRoute, GtfsSchedule } from './types'

export type ParsedStop = {
  id: string
  name: string
  code?: string | null
  lat: number
  lon: number
  locationType: string
  parentId: string | null
  platformCode: string | null
  wheelchair: 0 | 1 | 2
  street?: string | null
}

export type ParsedTrip = {
  routeId: string
  serviceId: string
  tripId: string
  headsign: string | null
  directionId: 0 | 1 | 2
  /** `exceptional=1` — zjazd do zajezdni / kurs techniczny. Domyślnie `false`. */
  exceptional?: boolean
}

export type ParsedFrequency = {
  tripId: string
  startSec: number | null
  endSec: number | null
  headwaySecs: number
}

export type ParsedCalendar = {
  serviceId: string
  startDate: string
  endDate: string
  /** [pon..niedz] */
  days: boolean[]
}

export type ParsedCalendarDate = { serviceId: string; date: string; added: boolean }

export type BuildScheduleInput = {
  feedVersion: string | null
  /** [wczoraj, dziś, jutro] jako yyyy-MM-dd. */
  serviceDates: [string, string, string]
  timezone: string
  attribution: string[]
  routes: GtfsRoute[]
  stops: ParsedStop[]
  trips: ParsedTrip[]
  frequencies: ParsedFrequency[]
  calendars: ParsedCalendar[]
  calendarDates: ParsedCalendarDate[]
  /** Surowe linie `stop_times.txt` WŁĄCZNIE z wierszem nagłówka. */
  stopTimeLines: AsyncIterable<string> | Iterable<string>
}

/** Rosnąca tablica typowana — podwajanie zamiast transientu z tablic JS. */
function grower<T extends Int32Array | Uint32Array | Uint16Array | Uint8Array | Float64Array>(Ctor: new (n: number) => T) {
  let arr = new Ctor(1024)
  let len = 0
  return {
    push(value: number) {
      if (len === arr.length) {
        const next = new Ctor(arr.length * 2)
        next.set(arr)
        arr = next
      }
      arr[len] = value
      len += 1
    },
    finish(): T {
      return arr.slice(0, len) as T
    },
  }
}

/**
 * `parent_station`, gdy niepuste (metro `7014M:P1` → `7014M`); inaczej
 * `stop_id.slice(0,4)` przy `/^\d{6}$/` (ZTM `100101` → `1001`); inaczej samo
 * `stop_id`. FALLBACK to konwencja ZTM, nie gwarancja GTFS-a — kolejne miasto
 * może wymagać innej reguły (wtedy trafi do `CityFeed`).
 */
export function groupStopId(stop: { id: string; parentId: string | null }): string {
  if (stop.parentId !== null && stop.parentId !== '') return stop.parentId
  if (/^\d{6}$/.test(stop.id)) return stop.id.slice(0, 4)
  return stop.id
}

/**
 * Nazwy słupków ZTM niosą numer słupka na końcu („Centrum 01", „Centrum 02").
 * To ten sam zespół — obcinamy numer, żeby wyszukiwarka pokazywała jeden wpis.
 * Konwencja ZTM, nie gwarancja GTFS-a — kolejne miasto może wymagać innej reguły.
 */
export function cleanGroupName(name: string): string {
  return name.replace(/\s+\d{2}$/, '').trim() || name
}

/** GTFS dzień tygodnia: 0 = poniedziałek … 6 = niedziela. */
function gtfsWeekday(date: string): number {
  const sundayFirst = new Date(`${date}T12:00:00Z`).getUTCDay()
  return (sundayFirst + 6) % 7
}

/** Zbiór aktywnych `service_id` dla jednej daty: `calendar` z naniesionymi wyjątkami z `calendar_dates`. */
function activeServices(date: string, calendars: ParsedCalendar[], calendarDates: ParsedCalendarDate[]): Set<string> {
  const yyyymmdd = date.replace(/-/g, '')
  const weekday = gtfsWeekday(date)
  const active = new Set<string>()

  for (const calendar of calendars) {
    if (yyyymmdd < calendar.startDate || yyyymmdd > calendar.endDate) continue
    if (calendar.days[weekday]) active.add(calendar.serviceId)
  }
  for (const exception of calendarDates) {
    if (exception.date !== yyyymmdd) continue
    if (exception.added) active.add(exception.serviceId)
    else active.delete(exception.serviceId)
  }
  return active
}

export async function buildSchedule(input: BuildScheduleInput): Promise<GtfsSchedule> {
  const { serviceDates, timezone } = input

  // ── linie ─────────────────────────────────────────────────────────────────
  const routes = input.routes
  const routeIndexById = new Map<string, number>()
  routes.forEach((route, index) => routeIndexById.set(route.id, index))

  // ── przystanki ────────────────────────────────────────────────────────────
  const n = input.stops.length
  const stopIds: string[] = new Array(n)
  const stopNames: string[] = new Array(n)
  const stopLat = new Float64Array(n)
  const stopLon = new Float64Array(n)
  const stopParent = new Int32Array(n).fill(-1)
  const stopGroupIds: string[] = new Array(n)
  const stopPlatforms: (string | null)[] = new Array(n)
  const stopCodes: (string | null)[] = new Array(n)
  const stopStreets: (string | null)[] = new Array(n)
  const stopWheelchair = new Uint8Array(n)
  const stopIndexById = new Map<string, number>()

  input.stops.forEach((stop, index) => {
    stopIds[index] = stop.id
    stopNames[index] = stop.name
    stopLat[index] = stop.lat
    stopLon[index] = stop.lon
    stopPlatforms[index] = stop.platformCode
    stopCodes[index] = stop.code ?? null
    stopStreets[index] = stop.street ?? null
    stopWheelchair[index] = stop.wheelchair
    stopIndexById.set(stop.id, index)
  })

  const groupMembers = new Map<string, number[]>()
  const groupName = new Map<string, string>()
  input.stops.forEach((stop, index) => {
    const parentIdx = stop.parentId !== null ? stopIndexById.get(stop.parentId) : undefined
    if (parentIdx !== undefined) stopParent[index] = parentIdx

    const group = groupStopId(stop)
    stopGroupIds[index] = group
    const members = groupMembers.get(group)
    if (members === undefined) groupMembers.set(group, [index])
    else members.push(index)
    if (!groupName.has(group) && stop.name !== '') groupName.set(group, cleanGroupName(stop.name))
  })
  // Preferuj nazwę rodzica zespołu, gdy istnieje.
  for (const [group, members] of groupMembers) {
    const parentIdx = members.map((m) => stopParent[m]).find((p) => p >= 0)
    if (parentIdx !== undefined && stopNames[parentIdx] !== '') groupName.set(group, cleanGroupName(stopNames[parentIdx]))
  }

  // ── kursy: rozwinięcie na doby kursowania ─────────────────────────────────
  const activeSets = serviceDates.map((date) => activeServices(date, input.calendars, input.calendarDates))
  const frequencyTripIds = new Set(input.frequencies.map((frequency) => frequency.tripId))

  // Kategoria dnia per `service_id` — do sekcji rozkładu linii („dni robocze",
  // „soboty", „niedziele i święta"). Dni tygodnia z `calendar_dates` (feed bez
  // `calendar.txt`) i z flag `calendar.txt`, potem token w id (patrz `serviceCategory`).
  const CATEGORY_CODE: Record<ServiceCategory, number> = { weekday: 0, friday: 1, saturday: 2, sunday: 3, other: 4 }
  const serviceWeekdays = new Map<string, Set<number>>()
  const noteWeekday = (serviceId: string, weekday: number) => {
    const set = serviceWeekdays.get(serviceId) ?? new Set<number>()
    set.add(weekday)
    serviceWeekdays.set(serviceId, set)
  }
  for (const exception of input.calendarDates) {
    if (!exception.added) continue
    const iso = `${exception.date.slice(0, 4)}-${exception.date.slice(4, 6)}-${exception.date.slice(6, 8)}`
    noteWeekday(exception.serviceId, gtfsWeekday(iso))
  }
  for (const calendar of input.calendars) calendar.days.forEach((on, weekday) => on && noteWeekday(calendar.serviceId, weekday))
  const categoryOf = (serviceId: string): number =>
    CATEGORY_CODE[serviceCategory(serviceId, serviceWeekdays.get(serviceId) ?? new Set())]

  const headsigns: string[] = []
  const headsignIndex = new Map<string, number>()
  const internHeadsign = (value: string | null): number => {
    if (value === null || value === '') return -1
    const existing = headsignIndex.get(value)
    if (existing !== undefined) return existing
    const index = headsigns.length
    headsigns.push(value)
    headsignIndex.set(value, index)
    return index
  }

  const tripIds: string[] = []
  const tripRoute: number[] = []
  const tripHeadsign: number[] = []
  const tripServiceDay: number[] = []
  const tripDirection: number[] = []
  const tripCategoryList: number[] = []
  const tripFrequencyBased: number[] = []
  /** base trip_id → indeksy wpisów (po jednym na dobę, w której kurs jest aktywny). */
  const tripEntriesById = new Map<string, number[]>()
  /** base trip_id → meta — do wzorca przebiegu i indeksu rozkładu linii (`lineRuns`). */
  const tripMetaById = new Map<
    string,
    { routeIdx: number; direction: number; headsignIdx: number; category: number; exceptional: boolean }
  >()

  const pushTrip = (
    baseTripId: string,
    routeIdx: number,
    headsignIdx: number,
    day: number,
    direction: number,
    category: number,
    frequencyBased: boolean
  ): number => {
    const index = tripIds.length
    tripIds.push(baseTripId)
    tripRoute.push(routeIdx)
    tripHeadsign.push(headsignIdx)
    tripServiceDay.push(day)
    tripDirection.push(direction)
    tripCategoryList.push(category)
    tripFrequencyBased.push(frequencyBased ? 1 : 0)
    return index
  }

  for (const trip of input.trips) {
    const routeIdx = routeIndexById.get(trip.routeId) ?? -1
    const headsignIdx = internHeadsign(trip.headsign)
    const isFrequency = frequencyTripIds.has(trip.tripId)
    const category = categoryOf(trip.serviceId)
    tripMetaById.set(trip.tripId, { routeIdx, direction: trip.directionId, headsignIdx, category, exceptional: trip.exceptional === true })
    for (let day = 0; day < 3; day += 1) {
      if (!activeSets[day].has(trip.serviceId)) continue
      const entry = pushTrip(trip.tripId, routeIdx, headsignIdx, day, trip.directionId, category, isFrequency)
      const list = tripEntriesById.get(trip.tripId)
      if (list === undefined) tripEntriesById.set(trip.tripId, [entry])
      else list.push(entry)
    }
  }

  // ── zdarzenia ─────────────────────────────────────────────────────────────
  const noonEpochSec = serviceDates.map((date) => Math.round(serviceDayNoonEpoch(date, timezone) / 1000))
  const evTripG = grower(Uint32Array)
  const evStopG = grower(Uint32Array)
  const evArrG = grower(Int32Array)
  const evDepG = grower(Int32Array)
  const evAbsG = grower(Float64Array)
  const evSeqG = grower(Uint16Array)
  const evOnReqG = grower(Uint8Array)
  let droppedStopTimes = 0

  const addEvent = (tripEntry: number, stopIdx: number, arrSec: number, depSec: number, seq: number, onRequest: boolean) => {
    evTripG.push(tripEntry)
    evStopG.push(stopIdx)
    evArrG.push(arrSec)
    evDepG.push(depSec)
    // GTFS: czas przystanku = (południe doby − 12 h) + offset sekundowy.
    evAbsG.push(noonEpochSec[tripServiceDay[tripEntry]] - 12 * 3600 + depSec)
    evSeqG.push(seq > 0xffff ? 0xffff : seq)
    evOnReqG.push(onRequest ? 1 : 0)
  }

  // ── indeks rozkładu linii: JEDEN wpis na kurs (dowolna doba, także spoza
  // okna [wczoraj, dziś, jutro]), z pierwszego przystanku kursu. Strona linii
  // czyta go zamiast wycinka CSR — dzięki temu kolumny „soboty" / „niedziele"
  // są zawsze, niezależnie od tego, jaki dziś dzień. Kursy techniczne pomijamy.
  const runRouteG = grower(Int32Array)
  const runDirG = grower(Uint8Array)
  const runCatG = grower(Uint8Array)
  const runFirstStopG = grower(Uint32Array)
  const runDepSecG = grower(Int32Array)

  // ── stop_times: gorąca pętla (bez Zod) ───────────────────────────────────
  /** Wzorzec kursu częstotliwościowego: przystanki z offsetami względnymi. */
  const freqPattern = new Map<string, { stopIdx: number; arrSec: number; depSec: number; seq: number }[]>()

  // Reprezentatywny przebieg linii: akumulujemy słupki bieżącego kursu (plik
  // jest pogrupowany po `trip_id`), a na zmianie kursu rejestrujemy wzorzec.
  // Wybieramy NAJCZĘSTSZY przebieg dla pary (linia, kierunek), nie najdłuższy —
  // „najdłuższy" łapał kursy nietypowe (zjazdy do zajezdni z `exceptional=0`,
  // wydłużone objazdy), przez co strona linii pokazywała zły przystanek
  // startowy i tylko jedną kategorię dnia. O(1) amortyzowane.
  const routePatterns = new Map<string, { stops: number[]; offsets: number[]; headsignIdx: number; onRequest: number[] }>()
  /** `${routeKey}#${sygnatura słupków}` → ile kursów miało dokładnie ten przebieg. */
  const patternSeen = new Map<string, number>()
  /** `${routeKey}` → aktualnie wybrany wzorzec + jego licznik. */
  const patternPick = new Map<
    string,
    { stops: number[]; offsets: number[]; headsignIdx: number; onRequest: number[]; count: number }
  >()
  let patternTripId = ''
  let patternStops: { seq: number; stopIdx: number; depSec: number; onRequest: boolean }[] = []
  const registerPattern = (
    key: string,
    sorted: { seq: number; stopIdx: number; depSec: number; onRequest: boolean }[],
    headsignIdx: number
  ) => {
    const signature = sorted.map((p) => p.stopIdx).join(',')
    const seenKey = `${key}#${signature}`
    const count = (patternSeen.get(seenKey) ?? 0) + 1
    patternSeen.set(seenKey, count)
    const best = patternPick.get(key)
    if (best === undefined || count > best.count || (count === best.count && sorted.length > best.stops.length)) {
      const base = sorted[0].depSec
      patternPick.set(key, {
        stops: sorted.map((p) => p.stopIdx),
        offsets: sorted.map((p) => p.depSec - base),
        onRequest: sorted.map((p) => (p.onRequest ? 1 : 0)),
        headsignIdx,
        count,
      })
    }
  }
  const flushTrip = () => {
    if (patternStops.length > 0) {
      const meta = tripMetaById.get(patternTripId)
      if (meta !== undefined && meta.routeIdx >= 0 && !meta.exceptional) {
        const sorted = [...patternStops].sort((a, b) => a.seq - b.seq)
        registerPattern(`${meta.routeIdx}:${meta.direction}`, sorted, meta.headsignIdx)
        runRouteG.push(meta.routeIdx)
        runDirG.push(meta.direction)
        runCatG.push(meta.category)
        runFirstStopG.push(sorted[0].stopIdx)
        runDepSecG.push(sorted[0].depSec)
      }
    }
    patternStops = []
  }

  let header: Map<string, number> | null = null
  let tripIdCol = 0
  let stopIdCol = 0
  let arrCol = 0
  let depCol = 0
  let seqCol = 0
  let pickupCol = -1
  let dropoffCol = -1
  let fastTrip = false

  for await (const rawLine of input.stopTimeLines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line === '') continue

    if (header === null) {
      header = headerIndex(line)
      tripIdCol = header.get('trip_id') ?? 0
      stopIdCol = header.get('stop_id') ?? 0
      arrCol = header.get('arrival_time') ?? 0
      depCol = header.get('departure_time') ?? 0
      seqCol = header.get('stop_sequence') ?? 0
      pickupCol = header.get('pickup_type') ?? -1
      dropoffCol = header.get('drop_off_type') ?? -1
      fastTrip = tripIdCol === 0
      continue
    }

    let tripId: string
    if (fastTrip && !line.includes('"')) {
      const comma = line.indexOf(',')
      tripId = comma === -1 ? line : line.slice(0, comma)
    } else {
      const parsed = parseCsvLine(line)
      tripId = parsed[tripIdCol] ?? ''
    }

    // Kurs nieznany (spoza `trips.txt`) — pomijamy całkowicie.
    const meta = tripMetaById.get(tripId)
    const isFreq = frequencyTripIds.has(tripId)
    if (meta === undefined && !isFreq) continue

    const row = line.includes('"') ? parseCsvLine(line) : line.split(',')
    const arrSec = parseGtfsSeconds(row[arrCol] ?? '')
    const depSec = parseGtfsSeconds(row[depCol] ?? '')
    if (arrSec === null && depSec === null) {
      droppedStopTimes += 1
      continue
    }
    const stopIdx = stopIndexById.get(row[stopIdCol] ?? '')
    if (stopIdx === undefined) {
      droppedStopTimes += 1
      continue
    }
    const effArr = arrSec ?? depSec ?? 0
    const effDep = depSec ?? arrSec ?? 0
    const seqNum = Number(row[seqCol])
    const seq = Number.isFinite(seqNum) && seqNum >= 0 ? seqNum : 0
    const onRequest =
      (pickupCol >= 0 && row[pickupCol] === '3') || (dropoffCol >= 0 && row[dropoffCol] === '3')

    if (isFreq) {
      const point = { stopIdx, arrSec: effArr, depSec: effDep, seq }
      const pattern = freqPattern.get(tripId)
      if (pattern === undefined) freqPattern.set(tripId, [point])
      else pattern.push(point)
      continue
    }

    // Wszystkie kursy zasilają `routePatterns`/`lineRuns` (także spoza okna).
    if (tripId !== patternTripId) {
      flushTrip()
      patternTripId = tripId
    }
    patternStops.push({ seq, stopIdx, depSec: effDep, onRequest })

    // Zdarzenia (CSR, tablica odjazdów) tylko dla dób z okna.
    const entries = tripEntriesById.get(tripId)
    if (entries !== undefined) for (const entry of entries) addEvent(entry, stopIdx, effArr, effDep, seq, onRequest)
  }
  flushTrip()

  // Kursy częstotliwościowe (metro) też mają przebieg — z gotowego `freqPattern`.
  for (const [tripId, pattern] of freqPattern) {
    const meta = tripMetaById.get(tripId)
    if (meta === undefined || meta.routeIdx < 0 || meta.exceptional) continue
    const sorted = [...pattern].sort((a, b) => a.seq - b.seq).map((p) => ({ ...p, onRequest: false }))
    registerPattern(`${meta.routeIdx}:${meta.direction}`, sorted, meta.headsignIdx)
  }

  // Finalizacja: najczęstszy wzorzec per (linia, kierunek) → `routePatterns`.
  for (const [key, pick] of patternPick) {
    routePatterns.set(key, {
      stops: pick.stops,
      offsets: pick.offsets,
      headsignIdx: pick.headsignIdx,
      onRequest: pick.onRequest,
    })
  }

  // ── rozwinięcie frequencies (przy ładowaniu, przed CSR) ───────────────────
  // `${routeIdx}:${direction}` → takt: najkrótszy/najdłuższy headway i okno kursowania.
  // Strona linii pokazuje dla metra „co 2–4 min (05:00–01:00)" zamiast siatki minut.
  const routeFrequency = new Map<string, { startSec: number; endSec: number; minHeadway: number; maxHeadway: number }>()
  let droppedFrequencies = 0
  for (const frequency of input.frequencies) {
    const { startSec, endSec, headwaySecs, tripId } = frequency
    if (startSec === null || endSec === null || headwaySecs <= 0 || endSec <= startSec) {
      // Bez tego jeden wadliwy wiersz zawiesza proces w nieskończonej pętli.
      droppedFrequencies += 1
      continue
    }
    const pattern = freqPattern.get(tripId)
    const meta = tripMetaById.get(tripId)
    if (pattern === undefined || pattern.length === 0 || meta === undefined || meta.routeIdx < 0 || meta.exceptional) {
      droppedFrequencies += 1
      continue
    }
    const freqKey = `${meta.routeIdx}:${meta.direction}`
    const cur = routeFrequency.get(freqKey)
    routeFrequency.set(freqKey, {
      startSec: Math.min(cur?.startSec ?? startSec, startSec),
      endSec: Math.max(cur?.endSec ?? endSec, endSec),
      minHeadway: Math.min(cur?.minHeadway ?? headwaySecs, headwaySecs),
      maxHeadway: Math.max(cur?.maxHeadway ?? headwaySecs, headwaySecs),
    })

    const templates = tripEntriesById.get(tripId)
    if (templates === undefined) continue
    const patternFirstDep = pattern[0].depSec
    for (const template of templates) {
      const day = tripServiceDay[template]
      const routeIdx = tripRoute[template]
      const headsignIdx = tripHeadsign[template]
      const direction = tripDirection[template]
      const category = tripCategoryList[template]
      // `t < end` OSTRE — `end_time` to moment zmiany taktu (GTFS):
      // 05:00–05:23 co 480 s daje 05:00, 05:08, 05:16 — trzy, nie cztery.
      for (let t = startSec; t < endSec; t += headwaySecs) {
        const shift = t - patternFirstDep
        const instance = pushTrip(tripId, routeIdx, headsignIdx, day, direction, category, true)
        for (const point of pattern) {
          addEvent(instance, point.stopIdx, point.arrSec + shift, point.depSec + shift, point.seq, false)
        }
      }
    }
  }

  // ── finalizacja tablic ───────────────────────────────────────────────────
  const evTrip = evTripG.finish()
  const evStop = evStopG.finish()
  const evArrSec = evArrG.finish()
  const evDepSec = evDepG.finish()
  const evAbsSec = evAbsG.finish()
  const evSeq = evSeqG.finish()
  const evOnRequest = evOnReqG.finish()
  const evCount = evTrip.length

  const runRoute = runRouteG.finish()
  const runDir = runDirG.finish()
  const runCat = runCatG.finish()
  const runFirstStop = runFirstStopG.finish()
  const runDepSec = runDepSecG.finish()
  const runCount = runRoute.length

  // ── indeks CSR: przystanek → zdarzenia posortowane po evAbsSec ────────────
  const stopEventOffset = new Uint32Array(n + 1)
  for (let e = 0; e < evCount; e += 1) stopEventOffset[evStop[e] + 1] += 1
  for (let i = 0; i < n; i += 1) stopEventOffset[i + 1] += stopEventOffset[i]

  const stopEventOrder = new Uint32Array(evCount)
  const cursor = stopEventOffset.slice(0, n)
  for (let e = 0; e < evCount; e += 1) {
    const s = evStop[e]
    stopEventOrder[cursor[s]] = e
    cursor[s] += 1
  }
  for (let s = 0; s < n; s += 1) {
    const lo = stopEventOffset[s]
    const hi = stopEventOffset[s + 1]
    if (hi - lo < 2) continue
    const slice = Array.from(stopEventOrder.subarray(lo, hi))
    slice.sort((a, b) => evAbsSec[a] - evAbsSec[b])
    stopEventOrder.set(slice, lo)
  }

  // ── linie per zespół przystankowy — dla wyszukiwarki i podsumowania stopu ──
  // Iterujemy po grupach (kilka tysięcy), a nie po zdarzeniach (miliony): dla
  // każdego słupka grupy czytamy jego wycinek CSR i zbieramy indeksy linii.
  const groupRoutes = new Map<string, Set<number>>()
  for (const [groupId, members] of groupMembers) {
    const set = new Set<number>()
    for (const stopIndex of members) {
      for (let k = stopEventOffset[stopIndex]; k < stopEventOffset[stopIndex + 1]; k += 1) {
        const routeIdx = tripRoute[evTrip[stopEventOrder[k]]]
        if (routeIdx >= 0) set.add(routeIdx)
      }
    }
    groupRoutes.set(groupId, set)
  }

  return {
    feedVersion: input.feedVersion,
    serviceDates,
    timezone,
    attribution: input.attribution,
    stopIds,
    stopNames,
    stopLat,
    stopLon,
    stopParent,
    stopGroupIds,
    stopPlatforms,
    stopCodes,
    stopStreets,
    stopWheelchair,
    stopIndexById,
    groupMembers,
    groupName,
    groupRoutes,
    routes,
    routeIndexById,
    routePatterns,
    routeFrequency,
    runRoute,
    runDir,
    runCat,
    runFirstStop,
    runDepSec,
    runCount,
    tripIds,
    tripRoute: Int32Array.from(tripRoute),
    tripHeadsign: Int32Array.from(tripHeadsign),
    tripServiceDay: Uint8Array.from(tripServiceDay),
    tripDirection: Uint8Array.from(tripDirection),
    tripCategory: Uint8Array.from(tripCategoryList),
    tripFrequencyBased: Uint8Array.from(tripFrequencyBased),
    headsigns,
    evTrip,
    evStop,
    evArrSec,
    evDepSec,
    evAbsSec,
    evSeq,
    evOnRequest,
    evCount,
    stopEventOffset,
    stopEventOrder,
    droppedStopTimes,
    droppedFrequencies,
  }
}
