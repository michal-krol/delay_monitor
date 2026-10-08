'use client'

import { useEffect } from 'react'
import { APP_NAME } from '@/lib/siteMeta'
import './globals.css'

/**
 * Błąd w root layoucie — zastępuje go, więc ma własne `<html>`/`<body>`, własne style i NIE ma
 * `ThemeProvider` ani komponentów UI (mogły właśnie rzucić). Motyw odtwarzamy z `localStorage`
 * (klucz `next-themes`) albo z systemu. Nawigacja zwykłym `<a>`: router mógł paść razem z layoutem.
 * Surowy tekst błędu nie jest pokazywany (#4). Metadane są niedostępne w granicy błędu → `<title>`.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
    try {
      const stored = window.localStorage.getItem('theme')
      const dark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
    } catch {
      // Bez dostępu do pamięci/motywu zostaje jasny — komunikat i tak jest czytelny.
    }
  }, [error])

  return (
    <html lang="pl">
      <body>
        <title>{`Nie udało się wczytać aplikacji — ${APP_NAME}`}</title>
        <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
          <div className="glass flex max-w-md flex-col items-center gap-4 rounded-3xl px-8 py-10 text-center">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Nie udało się wczytać aplikacji</h1>
            <p className="text-sm text-text-secondary">Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => retry()}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-surface-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/5"
              >
                Spróbuj ponownie
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- layout (a z nim router) właśnie padł: pełne przeładowanie jest celowe */}
              <a
                href="/"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-surface-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/5"
              >
                Wróć do Pulpitu
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
