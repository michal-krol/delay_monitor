'use client'

import { CityRedirect } from '@/components/CityRedirect'

// Poza komponentem, żeby `to` było stabilne (efekt `CityRedirect` ma je w zależnościach). Zapytanie
// (`line`, `dir`, `at`, `hide`, `alerts`, `nearby`) przechodzi dalej bez zmian — walidacja jest na stronie miasta (#4).
const toCityMap = (city: string) => `/city/${city}/map${typeof window === 'undefined' ? '' : window.location.search}`

/** `/map` bez segmentu — menu „Mapa" i Start („W pobliżu mnie") tu prowadzą. */
export default function MapIndex() {
  return <CityRedirect to={toCityMap} />
}
