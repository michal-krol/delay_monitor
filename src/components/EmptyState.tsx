import type { ReactNode } from 'react'
import { AppTitle } from './AppTitle'
import { ThemeToggle } from './ThemeToggle'

type Props = {
  children: ReactNode
}

export function EmptyState({ children }: Props) {
  return (
    <div className="glass mx-auto mt-16 max-w-md rounded-3xl px-8 py-10 text-center">
      <div className="flex items-center justify-center gap-3">
        <AppTitle />
        <ThemeToggle />
      </div>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        Wyszukaj stację, aby dodać ją do ulubionych i śledzić opóźnienia.
      </p>
      <div className="mt-6">{children}</div>
    </div>
  )
}
