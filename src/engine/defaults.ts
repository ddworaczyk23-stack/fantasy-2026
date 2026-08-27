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
  // David's stated board: 1.08, 2.08, 3.09, then 9th every round after.
  // Standard snake does not produce that, so it ships as an explicit override.
  myPickOverrides: [8, 20, 33, 45, 57, 69, 81, 93, 105, 117, 129, 141, 153, 165, 177],
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
}

export const STORAGE_KEY = 'ddcc:state:v1'
export const STATE_VERSION = 1

/** Normalise weights so they always sum to 1. Guards against bad user input. */
export function normalizeWeights(w: Weights): Weights {
  const keys = Object.keys(w) as (keyof Weights)[]
  const total = keys.reduce((sum, k) => sum + (Number.isFinite(w[k]) ? Math.max(0, w[k]) : 0), 0)
  if (total <= 0) return { ...DEFAULT_WEIGHTS }
  const out = {} as Weights
  for (const k of keys) out[k] = Math.max(0, w[k]) / total
  return out
}
