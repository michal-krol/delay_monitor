import type { RealizationStatus } from '@/lib/board/realization'

/**
 * Token `--status-*-bg` rozcieńczony do `percent` % — jedyne źródło
 * półprzezroczystych odcieni statusu (podbarwienie i poświata wiersza tablicy,
 * akcent). Własne heksy/RGB obok tokenu rozjeżdżały się z plakietką.
 */
export function statusTint(status: RealizationStatus, percent: number): string {
  return `color-mix(in srgb, var(--status-${status}-bg) ${percent}%, transparent)`
}
