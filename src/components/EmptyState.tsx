import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
}

export function EmptyState({ children }: Props) {
  return (
    <div className="glass mx-auto mt-16 max-w-md rounded-3xl px-8 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">Monitor opóźnień PKP</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        Wyszukaj stację, aby dodać ją do ulubionych i śledzić opóźnienia.
      </p>
      <div className="mt-6">{children}</div>
    </div>
  )
}
