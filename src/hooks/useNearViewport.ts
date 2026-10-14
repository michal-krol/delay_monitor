import { useCallback, useRef, useState } from 'react'

/**
 * Callback ref + flag: `near` flips to true once, the first time the element comes within `rootMargin`
 * of the viewport, and never goes back (heavy content mounted from it must not unmount on scroll away).
 * Without `IntersectionObserver` (jsdom, very old browsers) it is true immediately — never a stuck placeholder.
 */
export function useNearViewport(rootMargin = '300px'): [(el: Element | null) => void, boolean] {
  const [near, setNear] = useState(false)
  const observer = useRef<IntersectionObserver | null>(null)

  const ref = useCallback(
    (el: Element | null) => {
      observer.current?.disconnect()
      observer.current = null
      if (el === null || near) return
      if (typeof IntersectionObserver === 'undefined') {
        setNear(true)
        return
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return
          setNear(true)
          io.disconnect()
        },
        { rootMargin },
      )
      io.observe(el)
      observer.current = io
    },
    [near, rootMargin],
  )

  return [ref, near]
}
