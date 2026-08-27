import { useSyncExternalStore } from 'react'

// ============================================================================
// UI-only presentation flag: "is the board still the shipped sample data".
// This is NOT part of the store contract (docs/CONTRACT.md deliberately does
// not expose it), so it lives here as a tiny external store the UI layer
// owns. It starts true (hydrate() loads sample data by default) and flips to
// false the moment the user replaces the board with a real CSV import. It
// flips back to true if they explicitly load the bundled sample draft again.
// ============================================================================

let isSample = true
const listeners = new Set<() => void>()

export function getIsSampleData(): boolean {
  return isSample
}

export function setIsSampleData(value: boolean): void {
  if (isSample === value) return
  isSample = value
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useIsSampleData(): boolean {
  return useSyncExternalStore(subscribe, getIsSampleData, getIsSampleData)
}
