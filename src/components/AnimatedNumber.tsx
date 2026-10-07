'use client'

import { lazy, Suspense } from 'react'
import { useReducedMotion } from '@/hooks/useMediaQuery'

type Props = {
  value: number
  prefix?: string
  suffix?: string
  className?: string
}

/**
 * Biblioteka (kilka kB) ładuje się leniwie, poza ścieżką pierwszego malowania: do tego czasu liczba jest widoczna
 * jako zwykły tekst (`data-number-fallback`, te same wymiary co element biblioteki, żeby podmiana nie przesuwała
 * układu), potem zastępują go toczące się cyfry.
 */
const NumberFlow = lazy(() => import('@number-flow/react'))

/**
 * Liczba z „toczącymi się” cyframi (`@number-flow/react`). Jedyne miejsce, które importuje bibliotekę.
 * Tekst dla czytników ekranu i zapytań to osobny `sr-only` węzeł — element własny biblioteki ogłaszałby się
 * jako „grafika”, więc widoczne cyfry są `aria-hidden`. Przy `prefers-reduced-motion` zwykły tekst i biblioteka
 * w ogóle się nie ładuje.
 */
export function AnimatedNumber({ value, prefix = '', suffix = '', className }: Props) {
  const reduced = useReducedMotion()
  const text = `${prefix}${value}${suffix}`
  if (reduced) return <span className={className}>{text}</span>
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <Suspense
        fallback={
          <span aria-hidden="true" data-number-fallback className="number-fallback">
            {text}
          </span>
        }
      >
        <NumberFlow aria-hidden="true" value={value} prefix={prefix} suffix={suffix} locales="pl-PL" format={{ useGrouping: false }} />
      </Suspense>
    </span>
  )
}
