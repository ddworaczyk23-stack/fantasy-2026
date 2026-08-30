import type { LeagueSettings, RosterSlots, SleeperConfig, Weights } from '../types'

export const DEFAULT_ROSTER: RosterSlots = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  DST: 1,
  K: 1,
  BENCH: 6,
}

export const DEFAULT_SETTINGS: LeagueSettings = {
  teams: 12,
  scoring: 'ppr',
  superflex: false,
  rounds: 15,
  snake: true,
  thirdRoundReversal: false,
  mySlot: 8,
  roster: DEFAULT_ROSTER,
  // Real board: 1.08 and 2.05 (a normal snake from slot 8), then the 9th slot
  // from round 3 onward, still snaking - 3.09, 4.04, 5.09, 6.04, and so on.
  // No single slot produces that, so the pick numbers ship as an explicit
  // override. Clear it in Settings to fall back to plain snake math.
  myPickOverrides: [8, 17, 33, 40, 57, 64, 81, 88, 105, 112, 129, 136, 153, 160, 177],
  pickOwners: null,
  kdstLastRounds: 2,
  allowEarlyKDst: false,
}

export const DEFAULT_WEIGHTS: Weights = {
  consensus: 0.35,
  opportunity: 0.2,
  scarcity: 0.15,
  adpValue: 0.15,
  fit: 0.1,
  upside: 0.05,
}

export const DEFAULT_SLEEPER: SleeperConfig = {
  username: '',
  leagueId: '',
  season: '2026',
  status: 'manual-mode',
  lastSyncAt: null,
  lastError: null,
  userId: '',
  draftId: '',
  adapter: 'live',
  autoSync: false,
  // 8s is ~7 calls/minute against Sleeper's 1000/minute ceiling.
  pollSeconds: 8,
  unmatched: [],
}

export const STORAGE_KEY = 'ddcc:state:v1'
export const STATE_VERSION = 1

export const LEAGUE_REGISTRY_KEY = 'ddcc:leagues:v1'
export const LEAGUE_REGISTRY_VERSION = 1

/** Per-league storage key, namespaced off the legacy single-blob key. */
export function leagueStorageKey(leagueId: string): string {
  return `${STORAGE_KEY}:${leagueId}`
}

export function makeLeagueId(): string {
  return `lg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Normalise weights so they always sum to 1. Guards against bad user input. */
export function normalizeWeights(w: Weights): Weights {
  const keys = Object.keys(w) as (keyof Weights)[]
  const total = keys.reduce((sum, k) => sum + (Number.isFinite(w[k]) ? Math.max(0, w[k]) : 0), 0)
  if (total <= 0) return { ...DEFAULT_WEIGHTS }
  const out = {} as Weights
  for (const k of keys) out[k] = Math.max(0, w[k]) / total
  return out
}
