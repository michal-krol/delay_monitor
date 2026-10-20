export const BASE_URL = 'https://pdp-api.plk-sa.pl'
const REQUEST_TIMEOUT_MS = 8000
const HOUR_MS = 60 * 60 * 1000

/**
 * Odstęp z jitterem przed jedynym ponowieniem po 5xx -- natychmiastowe
 * ponowienie najczęściej trafia w tę samą awarię po stronie API i zjada drugie
 * zapytanie z limitu na nic. Świadomie w `fetchJson` transportu (niżej), nie w
 * pojedynczym call-site jak wcześniej w `poller.ts` -- każde wywołanie PKP
 * (słownik stacji, rozkłady, realizacja, szczegóły przejazdu) ma dostawać tę
 * samą odporność, nie tylko to, które akurat ktoś owinął ręcznie.
 */
const RETRY_BASE_DELAY_MS = 500
const RETRY_JITTER_MS = 1000

/**
 * Pozostały budżet zapytań wg nagłówków API. `null` znaczy „nie wiadomo",
 * a nie „zero" — brak nagłówka nie może wyglądać jak wyczerpany limit.
 */
export type RateLimitBudget = {
  /** Ile zapytań zostało w oknie godzinowym. `null` = nie wiadomo (brak nagłówka), NIGDY „zero" — patrz AGENTS.md #3. */
  hourly: number | null
  daily: number | null
  /**
   * Sufity przypisane do klucza. Też z nagłówków (zweryfikowane na żywym API:
   * `X-RateLimit-Hourly-Limit: 100`, `X-RateLimit-Daily-Limit: 1000`), więc
   * nigdzie nie musimy ich wpisywać na sztywno ani zgadywać poziomu klucza.
   * `null` znaczy „nie wiadomo" dokładnie tak samo jak wyżej.
   */
  hourlyLimit: number | null
  dailyLimit: number | null
}

export class PkpApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'PkpApiError'
    this.status = status
  }
}

function minKnown(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null) return b ?? null
  if (b == null) return a
  return Math.min(a, b)
}

/**
 * Łączy dwie obserwacje budżetu z TEGO SAMEGO okna godzinowego. Pozostałe
 * zapytania w oknie tylko zmniejszają „ile zostało", więc wygrywa niższa
 * wartość; `null` („nie wiadomo") nigdy nie wygrywa z liczbą i nigdy nie staje
 * się zerem (AGENTS.md #3). Sufity bierzemy z `a` (świeższa obserwacja).
 * `b === null` zwraca `a` bez zmian.
 */
export function mergeBudgets(a: RateLimitBudget, b: RateLimitBudget | null): RateLimitBudget {
  if (b === null) return a
  return {
    hourly: minKnown(a.hourly, b.hourly),
    daily: minKnown(a.daily, b.daily),
    hourlyLimit: a.hourlyLimit ?? b.hourlyLimit ?? null,
    dailyLimit: a.dailyLimit ?? b.dailyLimit ?? null,
  }
}

/**
 * `apiKey: null` pomija nagłówek `X-API-Key` -- używane przez
 * `getNameDictionaries()`: te dwa endpointy są publiczne, a wysłanie klucza
 * mimo to (zweryfikowane na żywo) przełącza żądanie z darmowej, anonimowej
 * puli limitów na tę samą pulę 100/h co `/operations` -- dokładnie ten koszt,
 * którego to wywołanie ma unikać.
 */
async function fetchWithTimeout(url: string, apiKey: string | null): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      headers: apiKey === null ? {} : { 'X-API-Key': apiKey },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * `fetchWithTimeout` + sprawdzenie statusu + parsowanie JSON-a — dokładnie ten
 * sam wzorzec powtarzał się w trzech miejscach (słownik stacji, rozkłady,
 * realizacja). Zwraca też surowy `response`, bo `getOperations` potrzebuje
 * z niego nagłówków budżetu po odczytaniu ciała.
 */
async function fetchJsonOnce(
  url: string,
  apiKey: string | null,
  errorMessage: string,
  onResponse?: (response: Response) => void
): Promise<{ json: unknown; response: Response }> {
  const response = await fetchWithTimeout(url, apiKey)
  // Przed sprawdzeniem statusu: nagłówki 429 to najważniejsza obserwacja budżetu.
  onResponse?.(response)
  if (!response.ok) {
    throw new PkpApiError(`${errorMessage}: ${response.status}`, response.status)
  }
  const json = await response.json()
  return { json, response }
}

function parseRemaining(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function parseBudget(response: Response): RateLimitBudget {
  return {
    hourly: parseRemaining(response.headers.get('X-RateLimit-Hourly-Remaining')),
    daily: parseRemaining(response.headers.get('X-RateLimit-Daily-Remaining')),
    hourlyLimit: parseRemaining(response.headers.get('X-RateLimit-Hourly-Limit')),
    dailyLimit: parseRemaining(response.headers.get('X-RateLimit-Daily-Limit')),
  }
}

/**
 * Zaobserwowane na żywo (staging): PKP bywa chwilowo wolne i przekracza
 * `REQUEST_TIMEOUT_MS` (`fetchWithTimeout` przerywa żądanie przez
 * `AbortController`) -- to samo przejściowe zjawisko co 5xx, ale bez tego
 * warunku w ogóle nie było ponawiane. Rozpoznanie po `name`, nie po
 * `instanceof DOMException` -- Node/undici i przeglądarka zgadzają się co
 * do `name: 'AbortError'`, ale globalny `DOMException` bywał niedostępny
 * w starszych środowiskach Node, więc sprawdzanie `instanceof` jest tu
 * niepotrzebnym dodatkowym ryzykiem.
 */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

export type FetchJson = (url: string, errorMessage: string) => Promise<{ json: unknown; response: Response }>

export type PkpTransport = {
  /** Zapytanie z kluczem API (pula 100/h); nagłówki budżetu trafiają do `getLastBudget()`. */
  fetchJson: FetchJson
  /** Endpoint publiczny, bez klucza -- anonimowa pula, nie liczy się do naszego budżetu. */
  fetchPublicJson: FetchJson
  getLastBudget(): RateLimitBudget | null
}

/**
 * Transport HTTP do PKP: timeout, jedno ponowienie na 5xx/timeout z jitterem
 * i śledzenie budżetu z nagłówków `X-RateLimit-*`. Jedyne miejsce z `fetch(`
 * w tym katalogu (AGENTS.md #6).
 */
export function createPkpTransport(options: {
  apiKey: string
  now: () => Date
  sleep: (ms: number) => Promise<void>
  random: () => number
}): PkpTransport {
  const { apiKey, now, sleep, random } = options

  /**
   * Ostatni znany budżet z odpowiedzi z kluczem, z numerem godziny zegarowej,
   * w której go zapamiętano. ponytail: okno godzinowe PKP przybliżone godziną
   * zegarową; gdyby było kroczące, min zostanie zaniżony najwyżej do końca
   * godziny (poller tylko zwolni), a po zmianie godziny stan sam się czyści.
   */
  let lastBudget: { budget: RateLimitBudget; hour: number } | null = null
  const currentHour = () => Math.floor(now().getTime() / HOUR_MS)

  function noteBudget(response: Response): void {
    const next = parseBudget(response)
    // Odpowiedź bez żadnych nagłówków nic nie mówi — nie nadpisuj, nie zeruj.
    if (next.hourly === null && next.daily === null) return
    const hour = currentHour()
    lastBudget = { budget: mergeBudgets(next, lastBudget?.hour === hour ? lastBudget.budget : null), hour }
  }

  /**
   * `fetchJsonOnce` + jedno ponowienie na 5xx lub na timeout (AbortError), z
   * odstępem i jitterem. Wcześniej to ponowienie żyło tylko wokół
   * `getOperations` w `poller.ts` -- `/schedules` miał inną (catch-i-degraduj),
   * a `getTrainDetail` (patrz `/api/train`) nie miał żadnej. Jeden wspólny
   * wrapper daje tę samą odporność każdemu zapytaniu do PKP, nie tylko temu,
   * które akurat ktoś owinął ręcznie.
   */
  async function fetchJsonWithRetry(
    url: string,
    key: string | null,
    errorMessage: string
  ): Promise<{ json: unknown; response: Response }> {
    // Klucz `null` = endpoint publiczny, anonimowa pula -- nie liczy się do naszego budżetu.
    const onResponse = key === null ? undefined : noteBudget
    try {
      return await fetchJsonOnce(url, key, errorMessage, onResponse)
    } catch (err) {
      if ((err instanceof PkpApiError && err.status >= 500) || isAbortError(err)) {
        await sleep(RETRY_BASE_DELAY_MS + random() * RETRY_JITTER_MS)
        return fetchJsonOnce(url, key, errorMessage, onResponse)
      }
      throw err
    }
  }

  return {
    fetchJson: (url, errorMessage) => fetchJsonWithRetry(url, apiKey, errorMessage),
    fetchPublicJson: (url, errorMessage) => fetchJsonWithRetry(url, null, errorMessage),
    getLastBudget(): RateLimitBudget | null {
      return lastBudget !== null && lastBudget.hour === currentHour() ? lastBudget.budget : null
    },
  }
}
