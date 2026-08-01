import Image from 'next/image'
import { getCarrierInfo } from '@/lib/carriers'

type Props = {
  carrierCode: string
  size?: number
}

export function CarrierLogo({ carrierCode, size = 16 }: Props) {
  const info = getCarrierInfo(carrierCode)
  if (!info) return null
  return <Image src={info.logoSrc} alt={info.name} width={size} height={size} className="object-contain" />
}
