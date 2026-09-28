'use client'

import { CityRedirect } from '@/components/CityRedirect'

/** `/lines` bez segmentu — menu „Trasy" tu prowadzi. */
export default function LinesIndex() {
  return <CityRedirect to={(city) => `/city/${city}/lines`} />
}
