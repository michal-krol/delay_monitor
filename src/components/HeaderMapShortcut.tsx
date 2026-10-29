'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ICON_BUTTON_CLASS } from './IconButton'
import { ICON_SIZE, MapIcon } from './icons'

export function HeaderMapShortcut() {
  const pathname = usePathname()
  const city = pathname?.match(/^\/city\/([^/]+)(?:\/|$)/)?.[1]
  return <Link href={city === undefined ? '/map' : `/city/${city}/map`} aria-label="Mapa" className={`${ICON_BUTTON_CLASS} min-h-11 min-w-11 shrink-0`}><MapIcon size={ICON_SIZE.button} /></Link>
}
