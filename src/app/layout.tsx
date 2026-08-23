import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Manrope } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin', 'latin-ext'], // latin-ext = polskie znaki diakrytyczne (ą ć ę ł ń ó ś ź ż)
  weight: ['700', '800'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Monitor opóźnień',
  description: 'Opóźnienia pociągów na wybranych stacjach w czasie zbliżonym do rzeczywistego',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning className={manrope.variable}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
