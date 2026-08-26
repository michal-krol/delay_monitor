import { NextResponse } from 'next/server'
import { client } from '@/lib/board/instance'
import { getNetworkStats } from '@/lib/board/networkStats'

/**
 * Widżet ogólnopolski, nie per-stacja -- bez parametrów. `getNetworkStats()`
 * ma swój własny cache (patrz `networkStats.ts`), więc to wywołanie kosztuje
 * PKP tylko wtedy, gdy TTL faktycznie wygasł; nigdy nie rzuca (błędy
 * podzapytań są tam degradowane do ostatnich znanych danych).
 */
export async function GET() {
  const stats = await getNetworkStats(client)
  return NextResponse.json(stats)
}
