'use client'

import { CityRedirect } from '@/components/CityRedirect'

/** `/city` bez segmentu — menu „Odjazdy / Przyjazdy" tu prowadzi. */
export default function CityIndex() {
  return <CityRedirect to={(city) => `/city/${city}`} />
}
