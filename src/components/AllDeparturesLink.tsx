import Link from 'next/link'
import { NAV_FORWARD_TYPES } from '@/lib/navTransition'
import { ChevronRightIcon, ICON_SIZE } from './icons'
import { FOCUS_RING, HOVER } from './interaction'

/** „Wszystkie odjazdy” na karcie Startu: pełny link do tablicy miejsca (≥ 44 px), osobny od nagłówka karty. */
export function AllDeparturesLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      transitionTypes={NAV_FORWARD_TYPES}
      data-card-open
      className={`-mx-2 mt-1 flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 text-sm font-medium text-primary-text ${HOVER} ${FOCUS_RING}`}
    >
      Wszystkie odjazdy
      <ChevronRightIcon size={ICON_SIZE.button} className="shrink-0" />
    </Link>
  )
}
