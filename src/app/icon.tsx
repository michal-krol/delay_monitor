import { ImageResponse } from 'next/og'
import { ACCENT_GRADIENT, AppLogo } from '@/components/icons'

/** Favicona (32) i ikony PWA (192, 512) z tego samego `AppLogo` co w UI — jedno źródło ikon. */
export function generateImageMetadata() {
  return [32, 192, 512].map((px) => ({ id: String(px), size: { width: px, height: px }, contentType: 'image/png' }))
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const px = Number(await id)
  return new ImageResponse(<AppLogo size={px} background={ACCENT_GRADIENT} />, { width: px, height: px })
}
