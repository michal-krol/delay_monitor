import { describe, expect, it } from 'vitest'
import { OPERATING_DATE_PATTERN, STATION_ID_PATTERN } from './validation'

/**
 * Te dwa wzorce są pierwszą warstwą obrony na granicy zaufania (AGENTS.md #4):
 * decydują, co w ogóle może trafić do zapytania kierowanego do PKP. Dotąd były
 * sprawdzane wyłącznie pośrednio, przez testy route handlerów — czyli zawsze
 * razem z resztą logiki i nigdy na wprost.
 *
 * Uwaga na `RegExp.prototype.test` z flagą `g`: byłaby stanowa (`lastIndex`)
 * i dawałaby naprzemienne wyniki dla tego samego wejścia. Żaden z tych wzorców
 * jej nie ma i mieć nie powinien — stąd test powtarzający to samo wywołanie.
 */

describe('STATION_ID_PATTERN', () => {
  it.each(['1', '5100', '33605', '1234567890'])('przepuszcza poprawny identyfikator %s', (id) => {
    expect(STATION_ID_PATTERN.test(id)).toBe(true)
  })

  it.each([
    ['pusty', ''],
    ['11 cyfr (poza limitem)', '12345678901'],
    ['ujemny', '-1'],
    ['ułamek', '5100.5'],
    ['spacja wiodąca', ' 5100'],
    ['spacja końcowa', '5100 '],
    ['litery', 'abc'],
    ['mieszany', '51a00'],
    ['dopisanie parametru', '5100&pageSize=5000'],
    ['ucięcie zapytania', '5100#'],
    ['ścieżka', '../5100'],
    ['null byte', '5100\0'],
    ['znacznik HTML', '<script>'],
    ['SQL', "5100' OR '1'='1"],
    ['cyfry arabsko-indyjskie', '٥١٠٠'],
    ['pełna szerokość', '５１００'],
    ['plus', '+5100'],
    ['notacja wykładnicza', '5e3'],
    ['szesnastkowo', '0x5100'],
  ])('odrzuca %s', (_opis, value) => {
    expect(STATION_ID_PATTERN.test(value)).toBe(false)
  })

  it('odrzuca nową linię po poprawnej wartości -- kotwice muszą być $, nie końcem wiersza', () => {
    // Bez `$` dopasowującego KONIEC CIĄGU (a nie końca wiersza) „5100\nzło"
    // przeszłoby walidację i trafiło do zapytania do PKP.
    expect(STATION_ID_PATTERN.test('5100\nzło')).toBe(false)
    expect(STATION_ID_PATTERN.test('5100\n')).toBe(false)
  })

  it('jest bezstanowy -- ten sam ciąg daje ten sam wynik przy powtórzeniu', () => {
    expect(STATION_ID_PATTERN.test('5100')).toBe(true)
    expect(STATION_ID_PATTERN.test('5100')).toBe(true)
    expect(STATION_ID_PATTERN.test('5100')).toBe(true)
  })
})

describe('OPERATING_DATE_PATTERN', () => {
  it.each(['2026-08-30', '2026-01-01', '1999-12-31'])('przepuszcza poprawną datę %s', (date) => {
    expect(OPERATING_DATE_PATTERN.test(date)).toBe(true)
  })

  it.each([
    ['pusty', ''],
    ['bez zer wiodących', '2026-8-3'],
    ['format odwrotny', '30-08-2026'],
    ['ze slashami', '2026/08/30'],
    ['z czasem', '2026-08-30T12:00:00'],
    ['dwucyfrowy rok', '26-08-30'],
    ['spacja końcowa', '2026-08-30 '],
    ['ścieżka', '../2026-08-30'],
    ['znacznik HTML', '<script>'],
  ])('odrzuca %s', (_opis, value) => {
    expect(OPERATING_DATE_PATTERN.test(value)).toBe(false)
  })

  it('odrzuca nową linię po poprawnej dacie', () => {
    expect(OPERATING_DATE_PATTERN.test('2026-08-30\nzło')).toBe(false)
  })

  it('sprawdza wyłącznie KSZTAŁT, nie istnienie daty w kalendarzu', () => {
    // Świadome ograniczenie, nie luka: `2026-13-45` nie jest datą, ale jest
    // nieszkodliwe — trafia do PKP jako parametr i wraca pustym wynikiem albo
    // błędem. Wzorzec broni przed WSTRZYKNIĘCIEM, a nie przed bzdurą.
    // Test istnieje po to, żeby ta granica była zapisana, a nie domyślana.
    expect(OPERATING_DATE_PATTERN.test('2026-13-45')).toBe(true)
    expect(OPERATING_DATE_PATTERN.test('0000-00-00')).toBe(true)
  })
})
