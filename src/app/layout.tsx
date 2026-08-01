import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import './globals.css'

export const metadata: Metadata = {
  title: 'Monitor opóźnień PKP',
  description: 'Opóźnienia pociągów na wybranych stacjach w czasie zbliżonym do rzeczywistego',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(99,102,241,0.14),transparent)] dark:bg-slate-950 dark:bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(99,102,241,0.30),transparent)]">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
