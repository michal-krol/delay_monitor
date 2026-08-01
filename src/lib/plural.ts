/**
 * Polska odmiana rzeczownika przez liczbę.
 *
 * Trzy formy: 1 pociąg, 2–4 pociągi, 5+ pociągów — z wyjątkiem nastek
 * (12, 13, 14), które mimo końcówki 2–4 biorą formę mnogą „wiele".
 */
export function pluralPl(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count)

  if (abs === 1) return one

  const lastDigit = abs % 10
  const lastTwoDigits = abs % 100

  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return few
  }

  return many
}
