import { crc32, deflateRawSync } from 'node:zlib'

export type BuildEntry = {
  name: string
  data: Buffer
  method: 0 | 8
  localExtraLength?: number
}

/** Buduje prawidłowy klasyczny ZIP w pamięci — do testów `zip.ts` i `client.ts`. */
export function buildZip(entries: BuildEntry[]): Buffer {
  const localChunks: Buffer[] = []
  const centralChunks: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const stored = entry.method === 8 ? deflateRawSync(entry.data) : entry.data
    const localExtra = Buffer.alloc(entry.localExtraLength ?? 0)
    const checksum = crc32(entry.data)
    const localOffset = offset

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(entry.method, 8)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(stored.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(localExtra.length, 28)

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
    central.writeUInt16LE(0, 30)
    central.writeUInt32LE(localOffset, 42)
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

/** Odpowiedź `fetch` na `Range: bytes=...` z bufora — 206 + Content-Range, albo pełne 200. */
export function rangeResponder(archive: Buffer, opts: { ignoreRange?: boolean; etag?: string } = {}) {
  return async (_url: string, headers: Record<string, string>): Promise<Response> => {
    const etag = opts.etag ?? '"abc123"'
    if (opts.ignoreRange) {
      return new Response(new Uint8Array(archive), { status: 200, headers: { etag } })
    }
    const range = headers.Range ?? ''
    const suffix = /^bytes=-(\d+)$/.exec(range)
    const explicit = /^bytes=(\d+)-(\d+)$/.exec(range)
    let start: number
    let end: number
    if (suffix) {
      start = Math.max(0, archive.length - Number(suffix[1]))
      end = archive.length - 1
    } else if (explicit) {
      start = Number(explicit[1])
      end = Math.min(Number(explicit[2]), archive.length - 1)
    } else {
      return new Response('bad range', { status: 416 })
    }
    const slice = archive.subarray(start, end + 1)
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: { 'content-range': `bytes ${start}-${end}/${archive.length}`, etag },
    })
  }
}
