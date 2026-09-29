import type { ReactNode, Ref } from 'react'

type Props = {
  label: string
  onClick: () => void
  children: ReactNode
  /** Przełącznik (przypnij): `aria-pressed`. Bez tego zwykły przycisk. */
  pressed?: boolean
  /** `md` = 36 px, jak `ThemeToggle` obok w nagłówkach; `lg` = 44 px w panelach mapy. */
  size?: 'md' | 'lg'
  /** Tylko pozycjonowanie/widoczność (np. odsłanianie na hover karty), nie wygląd. */
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/** Wspólny wygląd `IconButton` (bez rozmiaru) — używa go też link ← w `TopBar`, żeby oba wyglądały tak samo. */
export const ICON_BUTTON_CLASS =
  'grid shrink-0 place-items-center rounded-full border border-surface-border text-text-secondary transition hover:bg-black/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-white/10'
/** Rozmiar `md` (36 px). */
export const ICON_BUTTON_MD_SIZE = 'h-9 w-9'

/**
 * Jeden przycisk-ikona bez podpisu dla „zamknij / przypnij / usuń” w całej appce —
 * ten sam krój co `ThemeToggle`, obok którego zwykle stoi. Wcześniej sześć
 * wariantów (z obwódką i bez, 28/36/44 px, kwadrat i koło).
 */
export function IconButton({ label, onClick, children, pressed, size = 'md', className = '', ref }: Props) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`${ICON_BUTTON_CLASS} ${size === 'lg' ? 'h-11 w-11' : ICON_BUTTON_MD_SIZE} ${className}`}
    >
      {children}
    </button>
  )
}
