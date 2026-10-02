import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import localFont from 'next/font/local'
import { ThemeProvider } from 'next-themes'
import { APP_DESCRIPTION, APP_NAME } from '@/lib/siteMeta'
import './globals.css'

// Plik w repo (Manrope, SIL OFL 1.1 — fonts/OFL.txt), nie next/font/google: build nie pobiera
// niczego z sieci (AGENTS.md #16), a jedno padnięcie CI na Google Fonts już było. Font zmienny
// z pełnym zestawem znaków, więc polskie diakrytyki są w środku.
const manrope = localFont({
  src: './fonts/Manrope-Variable.ttf',
  weight: '200 800',
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
}

// Kolory paska przeglądarki = `--bg-base` każdego motywu (globals.css). `viewport-fit=cover` pozwala
// rysować pod notchem (safe-area w pasku kart), `resizes-content` zmniejsza układ przy klawiaturze.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef0f8' },
    { media: '(prefers-color-scheme: dark)', color: '#070b14' },
  ],
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
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
