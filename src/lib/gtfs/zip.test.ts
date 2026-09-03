import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildZip } from '@/test-utils/zip'
import {
  findEndOfCentralDirectory,
  isZip64UnsupportedError,
  localDataOffset,
  parseCentralDirectory,
} from './zip'

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
