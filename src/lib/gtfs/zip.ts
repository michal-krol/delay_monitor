/**
 * Odczyt struktury ZIP-a bez rozpakowywania całości. Czysty — operuje na
 * `Buffer`ach, nie zna `fetch`. `client.ts` dostarcza bajty (żądaniami
 * zakresowymi), tutaj są tylko decyzje: które wpisy, gdzie się zaczynają,
 * metoda 0 vs 8, wykrycie Zip64.
 *
 * Wpis ZIP zapisany metodą 8 to surowy strumień deflate — `node:zlib`
 * `createInflateRaw()` czyta go wprost, zero nowych zależności.
 */

const EOCD_SIGNATURE = 0x06054b50
const ZIP64_EOCD_LOCATOR_SIGNATURE = 0x07064b50
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50

/** Sentinele „wartość nie mieści się w 32 bitach — patrz Zip64". */
const U32_MAX = 0xffffffff
const U16_MAX = 0xffff

export type EndOfCentralDirectory = {
  centralDirectoryOffset: number
  centralDirectorySize: number
  entryCount: number
}

export type ZipEntry = {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  /** Offset nagłówka lokalnego tego wpisu w archiwum. */
  localHeaderOffset: number
}

class Zip64UnsupportedError extends Error {
  constructor() {
    super('Archiwum GTFS w formacie Zip64 — nieobsługiwane. Feed przekroczył limit klasycznego ZIP-a.')
    this.name = 'Zip64UnsupportedError'
  }
}

export function isZip64UnsupportedError(error: unknown): boolean {
  return error instanceof Zip64UnsupportedError
}

/**
 * Znajduje End Of Central Directory w ogonie archiwum (ostatnie ~64 KB
 * wystarczą — komentarz ZIP-a jest zwykle pusty). Zip64 → głośny błąd, bo
 * offsety wskazałyby wtedy śmieci.
 */
export function findEndOfCentralDirectory(tail: Buffer): EndOfCentralDirectory {
  // EOCD ma min. 22 bajty; skanujemy od końca w poszukiwaniu sygnatury.
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) !== EOCD_SIGNATURE) continue

    const entryCount = tail.readUInt16LE(i + 10)
    const centralDirectorySize = tail.readUInt32LE(i + 12)
    const centralDirectoryOffset = tail.readUInt32LE(i + 16)

    if (
      entryCount === U16_MAX ||
      centralDirectorySize === U32_MAX ||
      centralDirectoryOffset === U32_MAX ||
      containsZip64Locator(tail)
    ) {
      throw new Zip64UnsupportedError()
    }

    return { centralDirectoryOffset, centralDirectorySize, entryCount }
  }

  throw new Error('Nie znaleziono End Of Central Directory — to nie jest ZIP albo ogon jest za krótki.')
}

function containsZip64Locator(tail: Buffer): boolean {
  for (let i = 0; i + 4 <= tail.length; i += 1) {
    if (tail.readUInt32LE(i) === ZIP64_EOCD_LOCATOR_SIGNATURE) return true
  }
  return false
}

/**
 * Parsuje katalog centralny (bufor MUSI zaczynać się dokładnie na jego
 * początku — `centralDirectoryOffset` z EOCD). Zwraca wszystkie wpisy.
 */
export function parseCentralDirectory(centralDirectory: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = []
  let cursor = 0

  while (cursor + 46 <= centralDirectory.length) {
    if (centralDirectory.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER_SIGNATURE) break

    const method = centralDirectory.readUInt16LE(cursor + 10)
    const compressedSize = centralDirectory.readUInt32LE(cursor + 20)
    const uncompressedSize = centralDirectory.readUInt32LE(cursor + 24)
    const nameLength = centralDirectory.readUInt16LE(cursor + 28)
    const extraLength = centralDirectory.readUInt16LE(cursor + 30)
    const commentLength = centralDirectory.readUInt16LE(cursor + 32)
    const localHeaderOffset = centralDirectory.readUInt32LE(cursor + 42)

    if (compressedSize === U32_MAX || uncompressedSize === U32_MAX || localHeaderOffset === U32_MAX) {
      throw new Zip64UnsupportedError()
    }

    const name = centralDirectory.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset })

    cursor += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/**
 * Bajt, od którego zaczynają się skompresowane dane wpisu. Bufor to nagłówek
 * lokalny (min. 30 bajtów, wystarczy 30 + nazwa + extra).
 *
 * KLUCZOWE: długość pola `extra` w nagłówku lokalnym bywa INNA niż w katalogu
 * centralnym — offset danych trzeba liczyć z nagłówka lokalnego, nie z CD.
 */
export function localDataOffset(localHeader: Buffer, localHeaderOffset: number): number {
  if (localHeader.readUInt32LE(0) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error('Nagłówek lokalny bez sygnatury — offset z katalogu centralnego wskazał śmieci (regeneracja feedu w trakcie?).')
  }
  const nameLength = localHeader.readUInt16LE(26)
  const extraLength = localHeader.readUInt16LE(28)
  return localHeaderOffset + 30 + nameLength + extraLength
}
