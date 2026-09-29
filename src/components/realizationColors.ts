import type { RealizationStatus } from '@/lib/board/realization'

/**
 * Token `--status-*-bg` rozcieńczony do `percent` % — jedyne źródło
 * półprzezroczystych odcieni statusu (poświata karty, podbarwienie wiersza,
 * dekoracja). Własne heksy/RGB obok tokenu rozjeżdżały się z plakietką.
 */
export function statusTint(status: RealizationStatus, percent: number): string {
  return `color-mix(in srgb, var(--status-${status}-bg) ${percent}%, transparent)`
}

/**
 * Kolor obwódki/poświaty karty stacji (`StationCard.tsx`) wg statusu
 * najbliższego odjazdu. Mapa transportu celowo go NIE używa — tam kolor
 * oznacza wyłącznie rodzaj środka transportu (`map/mapData.ts`).
 */
export const GLOW_COLOR: Record<RealizationStatus, string> = {
  onTime: statusTint('onTime', 16),
  delayed: statusTint('delayed', 20),
  cancelled: statusTint('cancelled', 20),
  enRoute: statusTint('enRoute', 16),
  notStarted: statusTint('notStarted', 14),
  unknown: statusTint('unknown', 10),
}

export const BORDER_COLOR: Record<RealizationStatus, string> = {
  onTime: statusTint('onTime', 40),
  delayed: statusTint('delayed', 45),
  cancelled: statusTint('cancelled', 45),
  enRoute: statusTint('enRoute', 40),
  notStarted: statusTint('notStarted', 35),
  unknown: 'var(--surface-border)',
}
