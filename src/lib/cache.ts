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

/**
 * Leniwe, jednorazowe wczytanie zasobu niezmiennego przez cały czas życia
 * procesu (fixture'y, plik współrzędnych stacji).
 *
 * Pamiętamy OBIETNICĘ, nie wartość — równoległe pierwsze wywołania trafiają
 * w jedno odczytanie dysku zamiast ścigać się o nie.
 *
 * Ale porażki nie pamiętamy. Zapamiętana odrzucona obietnica wyłącza funkcję
 * do restartu procesu: jeden przejściowy błąd I/O gasi pogodę na stałe, mimo
 * że plik jest na miejscu i drugie podejście by się udało.
 */
export function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= load().catch((err: unknown) => {
      pending = null
      throw err
    })
    return pending
  }
}
