import { ImageResponse } from 'next/og'
import { ACCENT_GRADIENT, AppLogo } from '@/components/icons'

const SIZES = [32, 192, 512]
/** Rozmiary w wariancie maskowalnym (manifest, `purpose: 'maskable'`) — tylko ikony PWA, bez favicony. */
const MASKABLE_SIZES = [192, 512]
const MASKABLE_PREFIX = 'maskable-'

/**
 * Favicona (32) i ikony PWA (192, 512) z tego samego `AppLogo` co w UI — jedno źródło ikon. Wariant
 * maskowalny (`/icon/maskable-192`, `/icon/maskable-512`): gradient na całym kwadracie, bez zaokrąglenia —
 * Android sam przycina go do swojego kształtu. Znak `AppLogo` (60% boku, rysunek w viewBox x 3–21,
 * y 4–22) sięga najdalej ~27% boku od środka (krawędź koła), więc mieści się w strefie bezpiecznej
 * (koło o promieniu 40%).
 */
export function generateImageMetadata() {
  const image = (id: string, px: number) => ({ id, size: { width: px, height: px }, contentType: 'image/png' })
  return [
    ...SIZES.map((px) => image(String(px), px)),
    ...MASKABLE_SIZES.map((px) => image(`${MASKABLE_PREFIX}${px}`, px)),
  ]
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const iconId = await id
  const maskable = iconId.startsWith(MASKABLE_PREFIX)
  const px = Number(maskable ? iconId.slice(MASKABLE_PREFIX.length) : iconId)
  return new ImageResponse(<AppLogo size={px} background={ACCENT_GRADIENT} rounded={!maskable} />, {
    width: px,
    height: px,
  })
}
