/** Nazwa i opis aplikacji — jedno źródło dla metadanych strony (layout.tsx) i manifestu PWA. */
export const APP_NAME = 'Monitor opóźnień'
export const APP_DESCRIPTION = 'Opóźnienia pociągów na wybranych stacjach w czasie zbliżonym do rzeczywistego'

/**
 * `--bg-base` jasnego i ciemnego motywu (globals.css) — kolor paska przeglądarki (`viewport` w layout.tsx,
 * `ThemeColorSync`) i tło manifestu PWA. CSS nie importuje TS, więc zgodność pilnuje `siteMeta.test.ts`.
 */
export const THEME_BG = { light: '#eef0f8', dark: '#070b14' } as const
