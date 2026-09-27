import type { RealizationStatus } from '@/lib/board/realization'

/**
 * Kolor obwódki/poświaty karty stacji (`StationCard.tsx`) wg statusu
 * najbliższego odjazdu. Mapa transportu celowo go NIE używa — tam kolor
 * oznacza wyłącznie rodzaj środka transportu (`map/mapData.ts`).
 */
export const GLOW_COLOR: Record<RealizationStatus, string> = {
  onTime: 'rgba(22,163,74,0.16)',
  delayed: 'rgba(234,88,12,0.2)',
  cancelled: 'rgba(225,29,72,0.2)',
  enRoute: 'rgba(79,70,229,0.16)',
  notStarted: 'rgba(2,132,199,0.14)',
  unknown: 'rgba(51,65,85,0.1)',
}

export const BORDER_COLOR: Record<RealizationStatus, string> = {
  onTime: 'rgba(22,163,74,0.4)',
  delayed: 'rgba(234,88,12,0.45)',
  cancelled: 'rgba(225,29,72,0.45)',
  enRoute: 'rgba(79,70,229,0.4)',
  notStarted: 'rgba(2,132,199,0.35)',
  unknown: 'var(--surface-border)',
}
