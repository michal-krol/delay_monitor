import type { ReactNode } from 'react'
import { AppTitle } from './AppTitle'
import { TrainIcon } from './icons'

type Props = {
  children: ReactNode
}

export function EmptyState({ children }: Props) {
  return (
    <div className="glass mx-auto mt-16 flex max-w-md flex-col items-center gap-5 rounded-3xl px-8 py-12 text-center">
      <div
        className="grid h-16 w-16 place-items-center rounded-2xl text-white shadow-lg"
        style={{ background: 'var(--accent-gradient)' }}
      >
        <TrainIcon size={30} />
      </div>
      {/* font-heading nie jest na samym AppTitle (poza zasięgiem tego taska) —
          dziedziczy font-family z tego wrappera, bo h1 w AppTitle nie ustawia
          własnego. */}
      <div className="font-heading">
        <AppTitle />
      </div>
      <p className="-mt-2 text-sm text-text-muted">
        Wyszukaj stację, aby dodać ją do ulubionych i śledzić opóźnienia.
      </p>
      <div className="w-full">{children}</div>
    </div>
  )
}
