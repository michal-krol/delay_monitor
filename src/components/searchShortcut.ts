const TYPING_TARGET = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'

/**
 * Skrót otwierający wyszukiwarkę: Ctrl/Cmd+K działa zawsze (też z pola tekstowego),
 * „/" tylko poza polami — tam jest zwykłym znakiem.
 */
export function isSearchShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'target'>,
): boolean {
  if (event.altKey) return false
  if (event.ctrlKey || event.metaKey) return !event.shiftKey && event.key.toLowerCase() === 'k'
  if (event.shiftKey || event.key !== '/') return false
  const target = event.target
  return !(target instanceof Element && target.closest(TYPING_TARGET) !== null)
}
