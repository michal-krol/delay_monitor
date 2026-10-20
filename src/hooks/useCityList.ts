'use client'

import { fetchJson, usePolling } from '@/hooks/usePolling'

/** Jedno pobranie listy z `url` (wybór pola przez `pick`), ponawiane drabinką `usePolling`, dopóki rozkład się wczytuje (`null`). */
export function useCityList<T>(url: string, pick: (json: Record<string, unknown>) => T[] | null): T[] | null {
  // Opakowanie `{ items }`, bo `null` z `pick` („rozkład się wczytuje") ma napędzać ponawianie, a nie znaczyć „brak odpowiedzi".
  const { data } = usePolling<{ items: T[] | null }>(url, async () => ({ items: pick(await fetchJson<Record<string, unknown>>(url)) }), {
    refreshMs: null,
    isLoading: (result) => result.items === null,
  })
  return data?.items ?? null
}
