import type { ReactNode } from 'react'

const COLS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' } as const

/**
 * Jedna siatka kontrolek akcji: kolumny równej szerokości, każda ≥ 44 px wysokości na telefonie. Zastępuje
 * ręcznie układane rzędy (zakładki + Info, nagłówek mapy); dziecko zajmujące więcej kolumn dostaje
 * `col-span-*` od wywołującego, a układ desktopowy wywołujący przywraca przez `className`
 * (np. `sm:flex sm:flex-wrap`).
 */
export function ActionGrid({ cols, children, className = '', testId }: { cols: keyof typeof COLS; children: ReactNode; className?: string; testId?: string }) {
  return <div data-testid={testId} className={`grid items-stretch gap-2 max-sm:[&>*]:min-h-11 ${COLS[cols]} ${className}`.trim()}>{children}</div>
}
