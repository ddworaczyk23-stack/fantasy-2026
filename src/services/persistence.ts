import type { LeagueRegistry, SavedState } from '../types'
import {
  LEAGUE_REGISTRY_KEY,
  LEAGUE_REGISTRY_VERSION,
  STATE_VERSION,
  STORAGE_KEY,
  leagueStorageKey,
  makeLeagueId,
} from '../engine/defaults'
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

export function saveState(s: SavedState, leagueId: string): void {
  try {
    localStorage.setItem(leagueStorageKey(leagueId), JSON.stringify(s))
  } catch {
    // ignore - storage unavailable or quota exceeded
  }
}

export function loadState(leagueId: string): SavedState | null {
  try {
    const raw = localStorage.getItem(leagueStorageKey(leagueId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isValidSavedState(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearState(leagueId: string): void {
  try {
    localStorage.removeItem(leagueStorageKey(leagueId))
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// League registry - which leagues exist, and which one is active. Each
// league's actual draft data lives under its own namespaced key (above), so
// switching leagues never has to read or rewrite another league's data.
// ---------------------------------------------------------------------------

function isValidLeagueRegistry(value: unknown): value is LeagueRegistry {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== LEAGUE_REGISTRY_VERSION) return false
  if (typeof v.activeLeagueId !== 'string' || !v.activeLeagueId) return false
  if (!Array.isArray(v.leagues) || v.leagues.length === 0) return false
  return v.leagues.every(
    (l) =>
      l &&
      typeof l === 'object' &&
      typeof (l as Record<string, unknown>).id === 'string' &&
      typeof (l as Record<string, unknown>).name === 'string',
  )
}

export function loadLeagueRegistry(): LeagueRegistry | null {
  try {
    const raw = localStorage.getItem(LEAGUE_REGISTRY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isValidLeagueRegistry(parsed)) return null
    // Hand-edited or corrupted storage could point activeLeagueId at a league
    // that no longer exists - fall back to the first league rather than crash.
    if (!parsed.leagues.some((l) => l.id === parsed.activeLeagueId)) {
      parsed.activeLeagueId = parsed.leagues[0].id
    }
    return parsed
  } catch {
    return null
  }
}

export function saveLeagueRegistry(reg: LeagueRegistry): void {
  try {
    localStorage.setItem(LEAGUE_REGISTRY_KEY, JSON.stringify(reg))
  } catch {
    // ignore
  }
}

/**
 * Read the league registry, migrating once from the pre-league era if
 * needed. Idempotent: once the registry exists, this is a single read.
 *
 * A legacy bare `ddcc:state:v1` blob (from before leagues existed) is copied
 * into its own namespaced key and verified BEFORE the old key is deleted, so
 * a failure here never loses David's in-progress draft.
 */
export function loadOrMigrateLeagueRegistry(): LeagueRegistry {
  const existing = loadLeagueRegistry()
  if (existing) return existing

  let legacy: SavedState | null = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (isValidSavedState(parsed)) legacy = parsed
    }
  } catch {
    // ignore - treat as no legacy data
  }

  const id = makeLeagueId()
  const now = Date.now()
  const registry: LeagueRegistry = {
    version: LEAGUE_REGISTRY_VERSION,
    activeLeagueId: id,
    leagues: [{ id, name: 'League 1', createdAt: legacy?.savedAt ?? now, updatedAt: now }],
  }

  if (legacy) {
    saveState(legacy, id)
    if (loadState(id)) {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }
    }
  }
  saveLeagueRegistry(registry)
  return registry
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
