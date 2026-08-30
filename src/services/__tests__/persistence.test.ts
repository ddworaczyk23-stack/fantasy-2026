// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { LEAGUE_REGISTRY_KEY, STORAGE_KEY, leagueStorageKey } from '../../engine/defaults'
import { loadOrMigrateLeagueRegistry, loadState } from '../persistence'
import type { SavedState } from '../../types'

const legacyState = {
  version: 1,
  savedAt: 1234,
  players: [],
  picks: [],
  teams: [],
  settings: { teams: 12 },
  weights: {},
  sleeper: {},
} as unknown as SavedState

beforeEach(() => localStorage.clear())

describe('league registry migration', () => {
  it('creates a fresh League 1 without touching the legacy key', () => {
    const registry = loadOrMigrateLeagueRegistry()

    expect(registry.leagues).toHaveLength(1)
    expect(registry.leagues[0].name).toBe('League 1')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(LEAGUE_REGISTRY_KEY)).not.toBeNull()
  })

  it('copies a valid legacy state before removing its old key', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyState))

    const registry = loadOrMigrateLeagueRegistry()
    const id = registry.activeLeagueId
    expect(loadState(id)).toEqual(legacyState)
    expect(localStorage.getItem(leagueStorageKey(id))).not.toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('is a no-op after the registry exists', () => {
    const first = loadOrMigrateLeagueRegistry()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyState))

    expect(loadOrMigrateLeagueRegistry()).toEqual(first)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('ignores invalid legacy data and still creates a fresh league', () => {
    localStorage.setItem(STORAGE_KEY, '{}')

    const registry = loadOrMigrateLeagueRegistry()
    expect(registry.leagues[0].name).toBe('League 1')
    expect(loadState(registry.activeLeagueId)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })
})
