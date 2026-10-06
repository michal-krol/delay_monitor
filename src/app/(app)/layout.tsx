import type { ReactNode } from 'react'
import { AppChrome } from '@/components/AppChrome'
import { HeaderTitleProvider } from '@/components/headerTitle'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    // Kolumna na telefonie (nagłówek nad treścią, dolny pasek zakładek `fixed` — treść rezerwuje
    // pod nim `--bottom-nav-h`), wiersz od `sm` (pasek boczny obok; `--bottom-nav-h` = 0).
    <HeaderTitleProvider>
      <div className="flex min-h-screen flex-col pb-[var(--bottom-nav-h)] sm:flex-row">
        <AppChrome />
        {children}
      </div>
    </HeaderTitleProvider>
  )
}
