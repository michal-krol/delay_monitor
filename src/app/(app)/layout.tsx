import type { ReactNode } from 'react'
import { AppSidebar } from '@/components/AppSidebar'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      {children}
    </div>
  )
}
