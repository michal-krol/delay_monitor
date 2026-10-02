import type { MetadataRoute } from 'next'
import { APP_DESCRIPTION, APP_NAME, THEME_BG } from '@/lib/siteMeta'

// Kolory = `--bg-base` motywu jasnego (`THEME_BG`, patrz `viewport` w layout.tsx). Ikony generuje
// app/icon.tsx (generateImageMetadata: id 192, 512, maskable-192, maskable-512 → /icon/<id>). Bez
// service workera — instalowalność bez trybu offline.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: 'Opóźnienia',
    description: APP_DESCRIPTION,
    lang: 'pl',
    // Stała tożsamość aplikacji — zmiana start_url nie utworzy „nowej" instalacji.
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_BG.light,
    theme_color: THEME_BG.light,
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png' },
      { src: '/icon/maskable-192', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Pulpit', url: '/' },
      { name: 'Mapa', url: '/map' },
      { name: 'Linie', url: '/lines' },
    ],
  }
}
