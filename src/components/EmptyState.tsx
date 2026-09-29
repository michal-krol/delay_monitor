import { AppTitle } from './AppTitle'
import { AppLogo } from './icons'

export function EmptyState() {
  return (
    <div className="glass mx-auto mt-16 flex max-w-md flex-col items-center gap-5 rounded-3xl px-8 py-12 text-center">
      <div className="float ring-pulse rounded-2xl">
        <AppLogo size={64} />
      </div>
      <AppTitle />
      <p className="-mt-2 text-sm text-text-muted">
        Wyszukaj stację i przypnij ją do Pulpitu, żeby śledzić opóźnienia.
      </p>
    </div>
  )
}
