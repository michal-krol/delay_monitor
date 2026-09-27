/** Nazwa słupka do wyświetlenia — konwencja WTP „Saska 01", bez słowa „słupek". */
export function stopDisplayName(name: string, code: string | null): string {
  return code !== null && code !== '' ? `${name} ${code}` : name
}
