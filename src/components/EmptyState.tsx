/**
 * Pusty stan „Moje miejsca” na Starcie: krótka instrukcja i jedna akcja, bez ozdobnej karty zajmującej pierwszy
 * ekran. Nie pokazuje się, dopóki piny się wczytują (to szkielet, nie „Nie masz miejsc”, #7).
 */
export function EmptyState({ onFind }: { onFind: () => void }) {
  return (
    <div className="glass flex flex-col items-start gap-3 rounded-2xl border border-surface-border p-4">
      <p className="text-sm text-text-secondary">
        Nie masz jeszcze zapisanych miejsc. Znajdź stację lub przystanek i przypnij je gwiazdką — odjazdy pojawią się tutaj.
      </p>
      <button type="button" onClick={onFind} className="btn-primary">
        Znajdź miejsce
      </button>
    </div>
  )
}
