import type { MetadataRoute } from 'next'
import { APP_DESCRIPTION, APP_NAME } from '@/lib/siteMeta'

// Kolory = `--bg-base` motywu jasnego (patrz `viewport` w layout.tsx). Ikony generuje app/icon.tsx
// (generateImageMetadata: id 192 i 512 → /icon/192, /icon/512). Bez service workera — instalowalność
// bez trybu offline.
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
    background_color: '#eef0f8',
    theme_color: '#eef0f8',
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png' },
    ],
    shortcuts: [
      { name: 'Pulpit', url: '/' },
      { name: 'Mapa', url: '/map' },
      { name: 'Linie', url: '/lines' },
    ],
  }
}
