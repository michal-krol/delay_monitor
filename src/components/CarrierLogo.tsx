import { getCarrierInfo } from '@/lib/carriers'

type Props = {
  carrierCode: string
  size?: number
}

/**
 * Świadomie zwykły <img>, nie next/image.
 *
 * Optymalizator obrazów Next odmawia obsługi SVG bez dangerouslyAllowSVG
 * (`/_next/image?url=/carriers/km.svg` zwraca 400), więc dla tych plików
 * next/image i tak podstawiał surową ścieżkę — dokładając wyłącznie
 * loading="lazy", które na logo o wysokości 16 px tylko opóźnia render.
 */
export function CarrierLogo({ carrierCode, size = 16 }: Props) {
  const logoSrc = getCarrierInfo(carrierCode)?.logoSrc
  if (logoSrc === undefined) return null

  return (
    // eslint-disable-next-line @next/next/no-img-element -- next/image nie optymalizuje SVG (patrz komentarz wyżej), więc dokładałby tylko lazy-loading
    <img
      src={logoSrc}
      alt=""
      height={size}
      style={{ height: size, width: 'auto' }}
      className="shrink-0 object-contain"
    />
  )
}
