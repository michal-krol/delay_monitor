import { PageSkeleton } from '@/components/PageSkeleton'

// Celowo NIE w `(app)/loading.tsx`: skeleton nad stacją/przystankiem odbierałby przejściu widoku (Pulpit → tablica) wspólny tytuł
// (`PlaceTitle`, `e2e/motion.spec.ts`). Tu są ekrany bez takiego przejścia, a cięższe od reszty (rozkład, mapa, linia).
export default function Loading() {
  return <PageSkeleton />
}
