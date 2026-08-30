/**
 * Czyste funkcje lookup/format dla widżetu pogody -- zero I/O, żeby były
 * łatwe do przetestowania tabelami wejście→wyjście (patrz `format.test.ts`).
 */

export type WeatherIconKey = 'sun' | 'cloud' | 'fog' | 'rain' | 'snow' | 'thunder'

export type WeatherCondition = {
  label: string
  icon: WeatherIconKey
}

/**
 * WMO `weather_code` -> {ikona, polska nazwa}. Open-Meteo zwraca sam kod
 * liczbowy, bez tekstu ani ikony (https://open-meteo.com/en/docs, sekcja
 * WMO Weather interpretation codes) -- to jedyne miejsce, które go tłumaczy.
 * Nieznany kod nie jest błędem: dostaje neutralny fallback zamiast rzucać.
 */
const WEATHER_CODES: Record<number, WeatherCondition> = {
  0: { label: 'Bezchmurnie', icon: 'sun' },
  1: { label: 'Przeważnie bezchmurnie', icon: 'sun' },
  2: { label: 'Częściowe zachmurzenie', icon: 'cloud' },
  3: { label: 'Zachmurzenie całkowite', icon: 'cloud' },
  45: { label: 'Mgła', icon: 'fog' },
  48: { label: 'Mgła osadzająca szadź', icon: 'fog' },
  51: { label: 'Mżawka słaba', icon: 'rain' },
  53: { label: 'Mżawka umiarkowana', icon: 'rain' },
  55: { label: 'Mżawka intensywna', icon: 'rain' },
  56: { label: 'Marznąca mżawka słaba', icon: 'rain' },
  57: { label: 'Marznąca mżawka intensywna', icon: 'rain' },
  61: { label: 'Deszcz słaby', icon: 'rain' },
  63: { label: 'Deszcz umiarkowany', icon: 'rain' },
  65: { label: 'Deszcz intensywny', icon: 'rain' },
  66: { label: 'Marznący deszcz słaby', icon: 'rain' },
  67: { label: 'Marznący deszcz intensywny', icon: 'rain' },
  71: { label: 'Śnieg słaby', icon: 'snow' },
  73: { label: 'Śnieg umiarkowany', icon: 'snow' },
  75: { label: 'Śnieg intensywny', icon: 'snow' },
  77: { label: 'Śnieg ziarnisty', icon: 'snow' },
  80: { label: 'Przelotny deszcz słaby', icon: 'rain' },
  81: { label: 'Przelotny deszcz umiarkowany', icon: 'rain' },
  82: { label: 'Przelotny deszcz gwałtowny', icon: 'rain' },
  85: { label: 'Przelotny śnieg słaby', icon: 'snow' },
  86: { label: 'Przelotny śnieg intensywny', icon: 'snow' },
  95: { label: 'Burza', icon: 'thunder' },
  96: { label: 'Burza z gradem (słaba)', icon: 'thunder' },
  99: { label: 'Burza z gradem (silna)', icon: 'thunder' },
}

const UNKNOWN_CONDITION: WeatherCondition = { label: 'Warunki nieznane', icon: 'cloud' }

export function describeWeatherCode(code: number): WeatherCondition {
  return WEATHER_CODES[code] ?? UNKNOWN_CONDITION
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** 0–360° (kierunek, skąd wieje) -> róża wiatrów 8-punktowa. */
export function compassDirection(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360
  const index = Math.round(normalized / 45) % 8
  return COMPASS_POINTS[index]
}
