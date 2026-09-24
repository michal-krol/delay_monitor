import type { RealizationStatus } from '@/lib/board/realization'

/**
 * Kolor obwódki/poświaty karty (`StationCard.tsx`) i pinu stacji na mapie
 * miasta (`CityVehicleMap.tsx`) wg statusu najbliższego odjazdu — jeden kod
 * barw w całej apce (decyzja z brainstormingu 2026-09-23: mapa reużywa
 * dokładnie ten sam status, nie nową skalę wg minut/procentów).
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

/**
 * Stacja bez snapshotu (nigdy nie oglądana — `status: null` w odpowiedzi
 * `/api/rail-stations`) to inny stan niż `RealizationStatus.unknown` (mamy
 * dane, po prostu nie umiemy sklasyfikować). Osobny, wyraźnie neutralny kolor,
 * żeby pinu „brak danych" nie dało się pomylić z pinem „nieznany status".
 */
export const NEUTRAL_PIN_COLOR = 'rgba(100,116,139,0.35)'
