'use client'

import { useState } from 'react'
import { StarIcon } from './icons'

/**
 * Gwiazdka przypięcia z jednym „sprężynkowaniem” (`.star-pop`, `globals.css`) w chwili przypięcia.
 * `data-pop` ustawiamy tylko przy zmianie `pinned` false → true PO zamontowaniu: pierwszy render
 * już przypiętej gwiazdki, odpięcie i ponowne renderowanie przy pollingu nie animują. `settled=false` = przypięcia
 * jeszcze się wczytują (`usePinned().loaded`): odczyt z `localStorage` przełącza `pinned` false → true bez
 * udziału użytkownika i nie jest „puknięciem”. Stan wyprowadzony w trakcie renderu (nie w `useEffect` — reguła lintu repo).
 */
export function PinStar({ pinned, size, settled = true }: { pinned: boolean; size?: number; settled?: boolean }) {
  const [prev, setPrev] = useState({ pinned, settled })
  const [pop, setPop] = useState(false)
  if (prev.pinned !== pinned || prev.settled !== settled) {
    setPop(prev.pinned !== pinned && pinned && prev.settled && settled)
    setPrev({ pinned, settled })
  }
  return (
    <span data-testid="pin-star" className="star-pop inline-grid" data-pop={pop || undefined}>
      <StarIcon size={size} filled={pinned} />
    </span>
  )
}
