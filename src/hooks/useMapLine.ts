'use client'

import { useEffect, useMemo, useState } from 'react'
import { routeOverlay } from '@/components/map/mapData'
import { lineColor } from '@/components/transitMode'
import { useLineDetail } from '@/hooks/useLineDetail'
import type { LineListEntry } from '@/lib/gtfs/query'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { GTFS_ROUTE_ID_PATTERN } from '@/lib/validation'

/** Wybrana linia na mapie (`?line=`, `?dir=`): stan z URL-a, szczegóły linii i nakładka trasy. */
export function useMapLine(city: string, lines: LineListEntry[] | null) {
  const [routeParam, setRouteParam] = useState<string | null>(null)
  const [directionId, setDirectionId] = useState(0)

  useEffect(() => {
    // Odtworzenie stanu z URL-a, dostępnego tylko po zamontowaniu; zły parametr po cichu ignorowany (AGENTS #4).
    const line = readUrlParam('line')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRouteParam(line !== null && GTFS_ROUTE_ID_PATTERN.test(line) ? line : null)
    setDirectionId(readUrlParam('dir') === '1' ? 1 : 0)
  }, [])

  // `?line=` to `routeId`; stare linki niosły numer linii („20") — dopasowujemy go dokładnie.
  const line = useMemo(() => {
    if (routeParam === null || lines === null) return null
    return lines.find((l) => l.routeId === routeParam) ?? lines.find((l) => l.line === routeParam) ?? null
  }, [routeParam, lines])

  const lineDetail = useLineDetail(city, line?.routeId ?? null)
  const route = useMemo(() => {
    const directions = lineDetail.detail?.directions ?? []
    const direction = directions.find((d) => d.directionId === directionId) ?? directions[0]
    if (line === null || direction === undefined) return null
    return { key: `${line.routeId}:${direction.directionId}`, overlay: routeOverlay(direction), color: lineColor(line.mode, line.kind).bg }
  }, [line, lineDetail.detail, directionId])

  function chooseLine(next: LineListEntry | null, nextDirection = 0): void {
    setRouteParam(next?.routeId ?? null)
    setDirectionId(nextDirection)
    patchUrlParams({ line: next?.routeId ?? null, dir: next !== null && nextDirection === 1 ? '1' : null })
  }

  function changeDirection(next: number): void {
    setDirectionId(next)
    patchUrlParams({ dir: next === 1 ? '1' : null })
  }

  return { line, lineDetail, route, directionId, chooseLine, changeDirection }
}
