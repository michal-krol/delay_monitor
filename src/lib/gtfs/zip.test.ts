import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  findEndOfCentralDirectory,
  isZip64UnsupportedError,
  localDataOffset,
  parseCentralDirectory,
} from './zip'

type BuildEntry = {
  name: string
  data: Buffer
  /** 0 = stored, 8 = deflate */
  method: 0 | 8
  /** Długość pola `extra` w nagłówku LOKALNYM (celowo różna od CD). */
  localExtraLength?: number
}

/** Buduje prawidłowy klasyczny ZIP z podanych wpisów. */
function buildZip(entries: BuildEntry[]): Buffer {
  const localChunks: Buffer[] = []
  const centralChunks: Buffer[] = []
  const layout: { offset: number }[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const stored = entry.method === 8 ? deflateRawSync(entry.data) : entry.data
    const localExtra = Buffer.alloc(entry.localExtraLength ?? 0)
    const checksum = crc32(entry.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(entry.method, 8)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(stored.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(localExtra.length, 28)

    layout.push({ offset })
    const localRecord = Buffer.concat([local, nameBuf, localExtra, stored])
    localChunks.push(localRecord)
    offset += localRecord.length

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(entry.method, 10)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(stored.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30) // CD extra length — celowo 0, różne od lokalnego
    central.writeUInt32LE(layout[layout.length - 1].offset, 42)
    centralChunks.push(Buffer.concat([central, nameBuf]))
  }

  const centralDirectory = Buffer.concat(centralChunks)
  const centralDirectoryOffset = offset

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDirectory.length, 12)
  eocd.writeUInt32LE(centralDirectoryOffset, 16)

  return Buffer.concat([...localChunks, centralDirectory, eocd])
}

const ROUTES = Buffer.from('route_id,route_short_name,route_type\nM1,M1,1\n', 'utf8')
const FEED_INFO = Buffer.from('feed_version\n2026-09-02\n', 'utf8')

describe('zip.ts', () => {
  it('locates the central directory and lists every entry', () => {
    const archive = buildZip([
      { name: 'routes.txt', data: ROUTES, method: 8 },
      { name: 'feed_info.txt', data: FEED_INFO, method: 0 },
    ])

    const eocd = findEndOfCentralDirectory(archive)
    const cd = archive.subarray(eocd.centralDirectoryOffset, eocd.centralDirectoryOffset + eocd.centralDirectorySize)
    const list = parseCentralDirectory(cd)

    expect(list.map((entry) => entry.name)).toEqual(['routes.txt', 'feed_info.txt'])
    expect(list[0].method).toBe(8)
    expect(list[1].method).toBe(0)
  })

  it('computes the data offset from the LOCAL header extra length, not the central one', () => {
    const archive = buildZip([{ name: 'routes.txt', data: ROUTES, method: 8, localExtraLength: 6 }])
    const eocd = findEndOfCentralDirectory(archive)
    const [entry] = parseCentralDirectory(
      archive.subarray(eocd.centralDirectoryOffset, eocd.centralDirectoryOffset + eocd.centralDirectorySize)
    )

    const header = archive.subarray(entry.localHeaderOffset, entry.localHeaderOffset + 64)
    const dataStart = localDataOffset(header, entry.localHeaderOffset)

    // 30 (nagłówek) + 10 ("routes.txt") + 6 (extra lokalny) — CD twierdzi, że extra = 0.
    expect(dataStart).toBe(entry.localHeaderOffset + 30 + 10 + 6)

    const compressed = archive.subarray(dataStart, dataStart + entry.compressedSize)
    expect(inflateRawSync(compressed).toString('utf8')).toBe(ROUTES.toString('utf8'))
  })

  it('reads a stored (method 0) entry as raw bytes', () => {
    const archive = buildZip([{ name: 'feed_info.txt', data: FEED_INFO, method: 0 }])
    const eocd = findEndOfCentralDirectory(archive)
    const [entry] = parseCentralDirectory(
      archive.subarray(eocd.centralDirectoryOffset, eocd.centralDirectoryOffset + eocd.centralDirectorySize)
    )
    const header = archive.subarray(entry.localHeaderOffset, entry.localHeaderOffset + 64)
    const dataStart = localDataOffset(header, entry.localHeaderOffset)

    expect(archive.subarray(dataStart, dataStart + entry.compressedSize).toString('utf8')).toBe(FEED_INFO.toString('utf8'))
  })

  it('throws a loud, identifiable error on a Zip64 end-of-central-directory locator', () => {
    const archive = buildZip([{ name: 'routes.txt', data: ROUTES, method: 8 }])
    // Wstrzyknięcie sygnatury lokatora Zip64 tuż przed EOCD.
    const withLocator = Buffer.concat([
      archive.subarray(0, archive.length - 22),
      (() => {
        const locator = Buffer.alloc(20)
        locator.writeUInt32LE(0x07064b50, 0)
        return locator
      })(),
      archive.subarray(archive.length - 22),
    ])

    try {
      findEndOfCentralDirectory(withLocator)
      expect.unreachable('powinno rzucić')
    } catch (error) {
      expect(isZip64UnsupportedError(error)).toBe(true)
    }
  })

  it('throws when the local header signature is missing (offset points at garbage)', () => {
    expect(() => localDataOffset(Buffer.alloc(30), 0)).toThrow(/śmieci/)
  })
})
