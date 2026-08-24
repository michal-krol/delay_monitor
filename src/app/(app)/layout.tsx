import type { ReactNode } from 'react'

export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen">{children}</div>
}
