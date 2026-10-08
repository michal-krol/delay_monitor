import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import localFont from 'next/font/local'
import { ThemeProvider } from 'next-themes'
import { ThemeColorSync } from '@/components/ThemeColorSync'
import { APP_DESCRIPTION, APP_NAME, THEME_BG } from '@/lib/siteMeta'
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
  // iOS „Do ekranu początkowego": tryb aplikacji bez paska Safari. `black-translucent` rysuje treść pod
  // paskiem stanu — odstęp daje `env(safe-area-inset-top)` w `--header-h` / `Sidebar` (globals.css).
  appleWebApp: { capable: true, title: 'Opóźnienia', statusBarStyle: 'black-translucent' },
}

// Kolory paska przeglądarki = `--bg-base` każdego motywu (`THEME_BG`). Metki z `media` idą za motywem
// systemu; ręczny wybór (`ThemeToggle`) wpisuje do nich po stronie klienta `ThemeColorSync`.
// `viewport-fit=cover` pozwala rysować pod notchem (safe-area w pasku kart), `resizes-content`
// zmniejsza układ przy klawiaturze.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_BG.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_BG.dark },
  ],
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning className={manrope.variable}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ThemeColorSync />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
