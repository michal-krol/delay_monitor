'use client'

import { useState } from 'react'
import { StarIcon } from './icons'

/**
 * Gwiazdka przypięcia z jednym „sprężynkowaniem” (`.star-pop`, `globals.css`) w chwili przypięcia.
 * `data-pop` ustawiamy tylko przy zmianie `pinned` false → true PO zamontowaniu: pierwszy render
 * już przypiętej gwiazdki, odpięcie i ponowne renderowanie przy pollingu nie animują. Stan wyprowadzony
 * w trakcie renderu (nie w `useEffect` — reguła lintu repo).
 */
export function PinStar({ pinned, size }: { pinned: boolean; size?: number }) {
  const [prev, setPrev] = useState(pinned)
  const [pop, setPop] = useState(false)
  if (prev !== pinned) {
    setPrev(pinned)
    setPop(pinned)
  }
  return (
    <span data-testid="pin-star" className="star-pop inline-grid" data-pop={pop || undefined}>
      <StarIcon size={size} filled={pinned} />
    </span>
  )
}
