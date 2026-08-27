import type { SavedState } from '../types'
import { STATE_VERSION, STORAGE_KEY } from '../engine/defaults'

// ============================================================================
// localStorage persistence. Every access is wrapped in try/catch: private
// browsing windows, blocked site data, or a full quota must never crash the
// app — they should just behave as if there is no saved state.
// ============================================================================

function isValidSavedState(value: unknown): value is SavedState {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== STATE_VERSION) return false
  if (!Array.isArray(v.players)) return false
  if (!Array.isArray(v.picks)) return false
  if (!Array.isArray(v.teams)) return false
  if (!v.settings || typeof v.settings !== 'object') return false
  const settings = v.settings as Record<string, unknown>
  if (typeof settings.teams !== 'number') return false
  if (!v.weights || typeof v.weights !== 'object') return false
  if (!v.sleeper || typeof v.sleeper !== 'object') return false
  return true
}

export function saveState(s: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // ignore - storage unavailable or quota exceeded
  }
}

export function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isValidSavedState(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
