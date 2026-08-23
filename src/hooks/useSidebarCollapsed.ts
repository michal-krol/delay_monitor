'use client'

import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

const STORAGE_KEY = 'pkp.sidebarCollapsed.v1'
const collapsedSchema = z.boolean()

function readStorage(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return false
    const parsed: unknown = JSON.parse(raw)
    const result = collapsedSchema.safeParse(parsed)
    return result.success ? result.data : false
  } catch {
    return false
  }
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // Odłożone do efektu: odczyt localStorage podczas renderu dałby rozjazd
    // znacznika serwer/klient przy pierwszym malowaniu (ten sam powód co w useFavourites).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(readStorage())
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { collapsed, toggle }
}
