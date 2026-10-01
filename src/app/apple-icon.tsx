import { ImageResponse } from 'next/og'
import { ACCENT_GRADIENT, AppLogo } from '@/components/icons'

/** Ikona ekranu początkowego iOS z `AppLogo`, bez zaokrąglenia — iOS nakłada własną maskę. */
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(<AppLogo size={size.width} background={ACCENT_GRADIENT} rounded={false} />, size)
}
