import { ImageResponse } from 'next/og'
import { ACCENT_GRADIENT, AppLogo } from '@/components/icons'
import { MODE_ICON } from '@/components/transitMode'
import { APP_DESCRIPTION, APP_NAME, THEME_BG } from '@/lib/siteMeta'
import type { ShareCard } from './card'

export const SHARE_SIZE = { width: 1200, height: 630 }
export const SHARE_ALT = 'Monitor opóźnień — podgląd linku'
export const SHARE_CONTENT_TYPE = 'image/png'

// `ImageResponse` domyślnie ustawia `immutable, max-age=1 rok` — tu nazwy pochodzą z rozkładu, który
// się zmienia, a karta „generic" bywa chwilowym wynikiem zimnego startu (rozkład jeszcze niewczytany).
const CACHE_PLACE = 'public, max-age=86400, s-maxage=86400'
const CACHE_GENERIC = 'public, max-age=300, s-maxage=300'

const MUTED = '#9aa3b8'

/** Układ w stylach inline i flexem — Satori nie zna klas Tailwinda (jak `app/icon.tsx`). */
function Card({ card }: { card: ShareCard }) {
  const shell = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    width: '100%',
    height: '100%',
    padding: 72,
    color: 'white',
    background: THEME_BG.dark,
    borderTop: '14px solid #6366f1',
  } as const
  const brand = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <AppLogo size={88} background={ACCENT_GRADIENT} />
      <div style={{ display: 'flex', fontSize: 44, fontWeight: 700 }}>{APP_NAME}</div>
    </div>
  )

  if (card.kind === 'generic') {
    return (
      <div style={shell}>
        {brand}
        <div style={{ display: 'flex', fontSize: 52, lineHeight: 1.25, color: MUTED }}>{APP_DESCRIPTION}</div>
      </div>
    )
  }

  const ModeIcon = MODE_ICON[card.mode]
  return (
    <div style={shell}>
      {brand}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 40, color: '#38bdf8' }}>
          <ModeIcon size={52} />
          <div style={{ display: 'flex' }}>{card.label}</div>
        </div>
        <div style={{ display: 'flex', fontSize: card.title.length > 28 ? 72 : 108, fontWeight: 800, lineHeight: 1.1 }}>{card.title}</div>
        {card.detail !== null && <div style={{ display: 'flex', fontSize: 40, color: MUTED }}>{card.detail}</div>}
      </div>
      <div style={{ display: 'flex', fontSize: 40, color: MUTED }}>{card.city ?? ' '}</div>
    </div>
  )
}

export function shareImageResponse(card: ShareCard): ImageResponse {
  return new ImageResponse(<Card card={card} />, {
    ...SHARE_SIZE,
    headers: { 'Cache-Control': card.kind === 'place' ? CACHE_PLACE : CACHE_GENERIC },
  })
}
