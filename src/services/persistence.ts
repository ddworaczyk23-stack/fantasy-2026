import type { SavedState } from '../types'
import { STATE_VERSION, STORAGE_KEY } from '../engine/defaults'
import type { DashboardLayout } from '../dashboard/layout'
import { DASHBOARD_LAYOUT_VERSION, reconcileDashboardLayout } from '../dashboard/layout'

const LAYOUT_STORAGE_KEY = 'ddcc:layout:v1'

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

function isValidSavedLayout(value: unknown): value is { version: number; layout: DashboardLayout } {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== DASHBOARD_LAYOUT_VERSION) return false
  if (!Array.isArray(v.layout)) return false
  return v.layout.every(
    (e) => e && typeof e === 'object' && typeof (e as Record<string, unknown>).id === 'string' && typeof (e as Record<string, unknown>).span === 'number',
  )
}

export function saveDashboardLayout(layout: DashboardLayout): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ version: DASHBOARD_LAYOUT_VERSION, layout }))
  } catch {
    // ignore - storage unavailable or quota exceeded
  }
}

export function loadDashboardLayout(): DashboardLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isValidSavedLayout(parsed)) return null
    return reconcileDashboardLayout(parsed.layout as DashboardLayout)
  } catch {
    return null
  }
}

export function clearDashboardLayout(): void {
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY)
  } catch {
    // ignore
  }
}
