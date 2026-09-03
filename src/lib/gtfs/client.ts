/**
 * Granica sieci warstwy GTFS. Logika domenowa (`schedule.ts`, `query.ts`)
 * zależy WYŁĄCZNIE od tego interfejsu, nie od implementacji — dzięki temu testy
 * nie potrzebują ani sieci, ani ZIP-a.
 *
 * Granica leży na ROZPAKOWANYCH strumieniach wpisów, nie na pliku ZIP:
 * `mock.ts` nigdy nie dotyka `zlib` ani binarnego archiwum.
 *
 * `createLiveClient` jest CELOWO prawie bezgałęziowe — pobranie zakresu i
 * przekazanie do `zip.ts`. Każda decyzja (offsety, metoda 0/8, Zip64) mieszka
 * w czystym `zip.ts` (łatwym do pokrycia). Trudne strumieniowe I/O ma prawie
 * nic do pokrycia.
 */
import { createInflateRaw } from 'node:zlib'
import { Readable } from 'node:stream'
import { createInterface } from 'node:readline'
import { once } from '@/lib/cache'
import type { CityFeed } from './cities'
import { field, headerIndex, parseCsvLine, stripBom } from './csv'
import { feedInfoSchema } from './schema'
import {
  findEndOfCentralDirectory,
  localDataOffset,
  parseCentralDirectory,
  type ZipEntry,
} from './zip'

export interface GtfsClient {
  /**
   * Linie wpisu `name` (np. `stops.txt`) jako strumień, WŁĄCZNIE z nagłówkiem.
   * `null` = wpisu nie ma (np. `calendar.txt` bywa nieobecny, gdy kalendarz
   * siedzi wyłącznie w `calendar_dates.txt`).
   */
  readEntry(name: string): Promise<AsyncIterable<string> | null>
  /** `feed_version` z `feed_info.txt` — wartość otwarcia i strażnik spójności. */
  getFeedVersion(): Promise<string | null>
}

/** CDN, który zignorował `Range` (200 zamiast 206), ALBO feed zmienił się w trakcie (`If-Range`). */
export class RangeRequestUnsupportedError extends Error {
  constructor(detail: string) {
    super(`Serwer feedu nie obsłużył żądania zakresowego: ${detail}. Pobranie 107 MB w całości jest wykluczone — przerwano.`)
    this.name = 'RangeRequestUnsupportedError'
  }
}

export function isRangeRequestUnsupportedError(error: unknown): boolean {
  return error instanceof RangeRequestUnsupportedError
}

const TAIL_BYTES = 65536
/** 30 B nagłówka lokalnego + nazwa (≤ ~100) + pole extra (zwykle < 100). */
const LOCAL_HEADER_PROBE = 512
const USER_AGENT = 'delay-monitor-gtfs-loader (+https://github.com/michal-krol/delay_monitor)'

type RangeFetch = (url: string, headers: Record<string, string>) => Promise<Response>

async function rangeRequest(
  doFetch: RangeFetch,
  url: string,
  range: string,
  ifRange: string | null
): Promise<Response> {
  const headers: Record<string, string> = { Range: range, 'User-Agent': USER_AGENT }
  if (ifRange !== null) headers['If-Range'] = ifRange

  const response = await doFetch(url, headers)

  // 200 tam, gdzie oczekiwano 206: CDN zignorował Range albo `If-Range` nie
  // pasuje (feed zregenerowany). W obu wypadkach dalej to śmieci — odrzucamy głośno.
  if (response.status === 200) {
    throw new RangeRequestUnsupportedError('odpowiedź 200 zamiast 206')
  }
  if (response.status !== 206) {
    throw new RangeRequestUnsupportedError(`status ${response.status}`)
  }
  const contentRange = response.headers.get('content-range')
  if (contentRange === null || !/^bytes \d+-\d+\/\d+/.test(contentRange)) {
    throw new RangeRequestUnsupportedError(`brak/niepoprawny Content-Range (${contentRange ?? 'null'})`)
  }
  return response
}

async function linesFromResponse(response: Response, method: number): Promise<AsyncIterable<string>> {
  if (response.body === null) throw new Error('Pusta odpowiedź na żądanie zakresowe wpisu.')
  const raw = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
  // Wpis metodą 8 to surowy deflate — `createInflateRaw` czyta go wprost.
  const decoded = method === 8 ? raw.pipe(createInflateRaw()) : raw
  return createInterface({ input: decoded, crlfDelay: Infinity })
}

export function createLiveClient(city: CityFeed, deps: { fetch?: RangeFetch } = {}): GtfsClient {
  const doFetch: RangeFetch = deps.fetch ?? ((url, headers) => fetch(url, { headers }))
  const url = city.staticUrl

  // ETag ze wstępnego żądania — wysyłany jako `If-Range` na każdym kolejnym.
  let etag: string | null = null

  const loadDirectory = once(async (): Promise<Map<string, ZipEntry>> => {
    // Suffix range na ogon — mkuran to obsługuje (zweryfikowane).
    const tail = await rangeRequest(doFetch, url, `bytes=-${TAIL_BYTES}`, null)
    etag = tail.headers.get('etag')
    const tailBuffer = Buffer.from(await tail.arrayBuffer())
    const eocd = findEndOfCentralDirectory(tailBuffer)

    const cd = await rangeRequest(
      doFetch,
      url,
      `bytes=${eocd.centralDirectoryOffset}-${eocd.centralDirectoryOffset + eocd.centralDirectorySize - 1}`,
      etag
    )
    const entries = parseCentralDirectory(Buffer.from(await cd.arrayBuffer()))
    return new Map(entries.map((entry) => [entry.name, entry]))
  })

  async function readEntry(name: string): Promise<AsyncIterable<string> | null> {
    const directory = await loadDirectory()
    const entry = directory.get(name)
    if (entry === undefined) return null

    const headerResponse = await rangeRequest(
      doFetch,
      url,
      `bytes=${entry.localHeaderOffset}-${entry.localHeaderOffset + LOCAL_HEADER_PROBE}`,
      etag
    )
    const dataStart = localDataOffset(Buffer.from(await headerResponse.arrayBuffer()), entry.localHeaderOffset)

    const dataResponse = await rangeRequest(
      doFetch,
      url,
      `bytes=${dataStart}-${dataStart + entry.compressedSize - 1}`,
      etag
    )
    return linesFromResponse(dataResponse, entry.method)
  }

  return {
    readEntry,
    async getFeedVersion() {
      const stream = await readEntry('feed_info.txt')
      if (stream === null) return null
      let header: Map<string, number> | null = null
      for await (const rawLine of stream) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
        if (line === '') continue
        if (header === null) {
          header = headerIndex(stripBom(line))
          continue
        }
        return feedInfoSchema.parse({ feed_version: field(parseCsvLine(line), header, 'feed_version') }).feedVersion
      }
      return null
    },
  }
}
