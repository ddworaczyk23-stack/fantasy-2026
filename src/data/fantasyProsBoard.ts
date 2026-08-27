import rawAllRankings from './raw/fantasypros-2026-all-rankings.csv?raw'
import type { LeagueSettings, Player } from '../types'
import { DEFAULT_SETTINGS } from '../engine/defaults'
import { buildPlayersFromAllRankings, parseAllRankingsCsv } from '../services/fantasyProsAllRankings'

/**
 * The real board: FantasyPros' 2026 PPR "ALL Rankings" export.
 *
 * The raw CSV is the single source of truth and is imported verbatim, so
 * updating rankings means dropping in a fresh export - no code changes.
 *
 * Unlike a positional-only cheat sheet, this file carries a genuine overall
 * rank, overall tier, bye week and an ADP recoverable from its "ECR vs. ADP"
 * column - so almost nothing here is estimated. Only per-position tiers are
 * derived, because the file's tiers span every position at once. See
 * `src/services/fantasyProsAllRankings.ts`.
 */

export const FP_SOURCE_LABEL = 'FantasyPros 2026 PPR · Draft ALL Rankings export'

export const FP_DERIVED_LABEL = 'Overall rank, ADP and bye are from the file. Tiers are re-cut per position.'

export function makeFantasyProsBoard(settings: LeagueSettings = DEFAULT_SETTINGS): {
  players: Player[]
  notes: string[]
  errors: string[]
} {
  const { rows, errors } = parseAllRankingsCsv(rawAllRankings)
  const players = buildPlayersFromAllRankings(rows, settings)
  const notes = [
    'Upside and risk come from this file’s Upside/Bust star ratings. Floor is estimated as the ' +
      'inverse of Bust, since the sheet has no floor rating of its own.',
    'Tags (value / avoid-at-cost / sleeper / injury-concern) are inferred from the ADP gap and the ' +
      'star ratings - edit them in Rankings if you disagree.',
  ]
  return { players, notes, errors }
}

/** Convenience for callers that only want the players. */
export function makeFantasyProsPlayers(settings: LeagueSettings = DEFAULT_SETTINGS): Player[] {
  return makeFantasyProsBoard(settings).players
}
