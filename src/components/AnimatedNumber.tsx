'use client'

import NumberFlow from '@number-flow/react'
import { useReducedMotion } from '@/hooks/useMediaQuery'

type Props = {
  value: number
  prefix?: string
  suffix?: string
  className?: string
}

/**
 * Liczba z „toczącymi się” cyframi (`@number-flow/react`). Jedyne miejsce, które importuje bibliotekę.
 * Tekst dla czytników ekranu i zapytań to osobny `sr-only` węzeł — element własny biblioteki ogłaszałby się
 * jako „grafika” i jest ukryty (`aria-hidden`). Przy `prefers-reduced-motion` zwykły tekst, bez elementu niestandardowego.
 */
export function AnimatedNumber({ value, prefix = '', suffix = '', className }: Props) {
  const reduced = useReducedMotion()
  const text = `${prefix}${value}${suffix}`
  if (reduced) return <span className={className}>{text}</span>
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <NumberFlow aria-hidden="true" value={value} prefix={prefix} suffix={suffix} locales="pl-PL" format={{ useGrouping: false }} />
    </span>
  )
}
