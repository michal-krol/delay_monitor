/**
 * Minimalny parser CSV dla GTFS. Czysty — bez I/O.
 *
 * GTFS w naturze łamie założenia naiwnego `split(',')`: przecinki w nazwach
 * przystanków ujęte w cudzysłowy, `""` jako dosłowny cudzysłów, BOM UTF-8
 * w nagłówku, CRLF, puste pole końcowe. Wszystkie cztery to realne pułapki.
 */

/** Obcina BOM UTF-8 z początku ciągu, jeśli jest. */
export function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}

/**
 * Parsuje jedną linię CSV wg RFC 4180. Czytelnik linii (`readline`) obcina
 * `\n` i zwykle `\r`, ale gołe `\r` na końcu ucinamy tu na wszelki wypadek.
 * Pola spoza cudzysłowów są brane dosłownie (GTFS nie escape'uje ich inaczej).
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(field)
      field = ''
    } else if (ch === '\r') {
      // trailing CR z CRLF — pomijamy
    } else {
      field += ch
    }
  }

  fields.push(field)
  return fields
}

/**
 * Nazwa kolumny → jej indeks. Parser MUSI czytać kolumny przez tę mapę, nigdy
 * pozycyjnie: `stop_times.txt` z mkurana ma `stop_sequence` jako drugą kolumnę,
 * nie `arrival_time`, a kolejne miasto będzie miało jeszcze inną.
 */
export function headerIndex(headerLine: string): Map<string, number> {
  const index = new Map<string, number>()
  parseCsvLine(stripBom(headerLine)).forEach((name, position) => {
    index.set(name.trim(), position)
  })
  return index
}

/** Odczyt pola po nazwie; `''` gdy kolumny nie ma albo wiersz jest za krótki. */
export function field(row: string[], index: Map<string, number>, name: string): string {
  const position = index.get(name)
  return position === undefined ? '' : (row[position] ?? '')
}
