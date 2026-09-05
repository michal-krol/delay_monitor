import type { ReactNode } from 'react'
import { AppSidebar } from '@/components/AppSidebar'
import { MobileNav } from '@/components/MobileNav'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    // Kolumna na telefonie (pasek `MobileNav` nad treścią), wiersz od `sm`
    // (pasek boczny obok). `MobileNav` jest `sm:hidden`, `AppSidebar`
    // `hidden sm:flex` — wykluczają się na progu `sm`.
    <div className="flex min-h-screen flex-col sm:flex-row">
      <MobileNav />
      <AppSidebar />
      {children}
    </div>
  )
}
