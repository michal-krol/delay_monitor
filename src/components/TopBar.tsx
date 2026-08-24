'use client'

import Link from 'next/link'
import { ArrowLeftIcon, BellIcon } from './icons'

type HeaderVariant = {
  title: string
  subtitle: string
  backHref?: never
  backLabel?: never
}

type BackVariant = {
  backHref: string
  backLabel: string
  title?: never
  subtitle?: never
}

type Props = HeaderVariant | BackVariant

export function TopBar(props: Props) {
  return (
    <div className="flex items-center justify-between gap-4">
      {'backHref' in props && props.backHref !== undefined ? (
        <Link href={props.backHref} className="flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-foreground">
          <ArrowLeftIcon size={16} />
          {props.backLabel}
        </Link>
      ) : (
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">{props.title}</h1>
          <p className="mt-0.5 text-sm text-text-muted">{props.subtitle}</p>
        </div>
      )}

      <button
        type="button"
        aria-label="Powiadomienia"
        className="relative grid h-9 w-9 place-items-center rounded-full border text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
        style={{ borderColor: 'var(--surface-border)' }}
      >
        <BellIcon size={15} />
      </button>
    </div>
  )
}
