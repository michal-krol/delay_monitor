/**
 * Cache z czasem życia i twardym limitem liczby wpisów.
 *
 * Aplikacja to jeden długo żyjący proces, więc zwykła `Map` używana jako cache
 * nigdy nie oddaje pamięci: wygasłe wpisy zostają, dopóki ktoś nie zapyta
 * o dokładnie ten sam klucz. Przy kluczach pochodnych od zestawu obserwowanych
 * stacji taki cache rośnie z każdą zmianą ulubionych.
 *
 * Eksmisja jest FIFO po kolejności wstawienia (Map zachowuje ją z definicji),
 * nie LRU — przy tej skali nie warto liczyć trafień.
 */
export type TtlCache<V> = {
  get(key: string): V | undefined
  set(key: string, value: V): void
  size(): number
}

export type TtlCacheOptions = {
  ttlMs: number
  maxEntries: number
  now?: () => number
}

export function createTtlCache<V>(options: TtlCacheOptions): TtlCache<V> {
  const { ttlMs, maxEntries } = options
  const now = options.now ?? (() => Date.now())
  const entries = new Map<string, { value: V; expiresAt: number }>()

  function dropExpired(): void {
    const current = now()
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= current) entries.delete(key)
    }
  }

  return {
    get(key: string): V | undefined {
      const entry = entries.get(key)
      if (entry === undefined) return undefined
      if (entry.expiresAt <= now()) {
        entries.delete(key)
        return undefined
      }
      return entry.value
    },

    set(key: string, value: V): void {
      dropExpired()

      // Nadpisanie istniejącego klucza nie powiększa cache'u, ale ma odświeżyć
      // jego pozycję w kolejce eksmisji.
      entries.delete(key)

      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next()
        if (oldest.done === true) break
        entries.delete(oldest.value)
      }

      entries.set(key, { value, expiresAt: now() + ttlMs })
    },

    size(): number {
      return entries.size
    },
  }
}
