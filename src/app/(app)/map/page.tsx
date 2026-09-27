'use client'

import { CityRedirect } from '@/components/CityRedirect'

/** `/map` bez segmentu — menu „Mapa" tu prowadzi. */
export default function MapIndex() {
  return <CityRedirect to={(city) => `/city/${city}/map`} />
}
