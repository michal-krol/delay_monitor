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
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
