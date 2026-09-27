/**
 * `GtfsClient` na fixture'ach — zero sieci, zero `zlib`, zero binarnego
 * archiwum. Fixture'y to zwykłe `.txt` w `fixtures/gtfs/<city>/` (granica
 * `GtfsClient` leży na rozpakowanych strumieniach wpisów).
 *
 * `{{WCZORAJ}}`/`{{DZIS}}`/`{{JUTRO}}` w fixture'ach są podstawiane datami
 * kalendarzowymi strefy miasta przy odczycie — ta sama sztuczka co
 * `rebaseTrains()` w `pkp/mock.ts` i z tego samego powodu (fixture nie
 * starzeje się względem „dziś").
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { once } from '@/lib/cache'
import { serviceDateWindow } from '@/lib/pkp/time'
import type { CityFeed } from './cities'
import type { GtfsClient } from './client'
import { field, headerIndex, parseCsvLine, stripBom } from './csv'
import { feedInfoSchema } from './schema'

const DEFAULT_ROOT = path.join(process.cwd(), 'fixtures', 'gtfs')

/** Cache surowej treści pliku (przed podstawieniem tokenów) — `once()` z lib/cache. */
const rawLoaders = new Map<string, () => Promise<string | null>>()

function readRaw(filePath: string): Promise<string | null> {
  let loader = rawLoaders.get(filePath)
  if (loader === undefined) {
    loader = once(async () => {
      try {
        return await readFile(filePath, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    })
    rawLoaders.set(filePath, loader)
  }
  return loader()
}

async function* iterateLines(text: string): AsyncIterable<string> {
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      const end = i > start && text[i - 1] === '\r' ? i - 1 : i
      yield text.slice(start, end)
      start = i + 1
    }
  }
  if (start < text.length) yield text.slice(start)
}

export function createMockClient(city: CityFeed, root: string = DEFAULT_ROOT): GtfsClient {
  const dir = path.join(root, city.id)
  const [yesterday, today, tomorrow] = serviceDateWindow(new Date(), city.timezone)

  const substitute = (text: string): string =>
    text.replaceAll('{{WCZORAJ}}', yesterday).replaceAll('{{DZIS}}', today).replaceAll('{{JUTRO}}', tomorrow)

  return {
    async readEntry(name: string) {
      const raw = await readRaw(path.join(dir, name))
      return raw === null ? null : iterateLines(substitute(raw))
    },

    async getFeedVersion() {
      const raw = await readRaw(path.join(dir, 'feed_info.txt'))
      if (raw === null) return null
      const [headerLine, dataLine] = substitute(raw)
        .split(/\r?\n/)
        .filter((line) => line !== '')
      if (headerLine === undefined || dataLine === undefined) return null
      const index = headerIndex(stripBom(headerLine))
      const row = parseCsvLine(dataLine)
      return feedInfoSchema.parse({ feed_version: field(row, index, 'feed_version') }).feedVersion
    },
  }
}

/** Do testów: opróżnia cache surowych plików między przypadkami. */
export function __resetMockCache(): void {
  rawLoaders.clear()
}
