'use client'

import { ArrowLeftIcon, BellIcon } from './icons'

type HeaderVariant = {
  title: string
  subtitle: string
  backLabel?: never
  onBack?: never
}

/**
 * Strona-trasa (np. `/polaczenie/...`) nie zawsze zna adres strony-źródła
 * (mogła to być zakładka Odjazdy albo Przyjazdy pełnej tablicy) — stąd
 * `onBack` zamiast stałego `href`: cofa przez `router.back()`/`router.push('/')`
 * wybrane przez wywołującego, nie przez `TopBar`.
 */
type BackVariant = {
  backLabel: string
  onBack: () => void
  title?: never
  subtitle?: never
}

type Props = HeaderVariant | BackVariant

export function TopBar(props: Props) {
  const isBackVariant = 'backLabel' in props && props.backLabel !== undefined
  const backLinkClassName = 'flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-foreground'

  return (
    <div className="flex items-center justify-between gap-4">
      {isBackVariant ? (
        <button type="button" onClick={props.onBack} className={backLinkClassName}>
          <ArrowLeftIcon size={16} />
          {props.backLabel}
        </button>
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
