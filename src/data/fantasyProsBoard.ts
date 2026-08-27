import rawCheatSheet from './raw/fantasypros-2026-cheatsheet.txt?raw'
import type { LeagueSettings, Player } from '../types'
import { DEFAULT_SETTINGS } from '../engine/defaults'
import { buildBoardFromPositional, parsePositionalCheatSheet } from '../services/valueBoard'

/**
 * The real board: FantasyPros' 2026 PPR positional cheat sheet.
 *
 * The raw text file is the single source of truth and is imported verbatim, so
 * updating rankings means editing one plain-text file - no code changes and no
 * codegen step.
 *
 * The sheet gives positional ranks only. Overall rank and tiers are derived
 * from value over replacement for the configured lineup; see `valueBoard.ts`.
 */

export const FP_SOURCE_LABEL = 'FantasyPros 2026 PPR · positional cheat sheet · 08/26/2026'

export const FP_DERIVED_LABEL = 'Overall rank + tiers derived from positional rank (VOR)'

export function makeFantasyProsBoard(settings: LeagueSettings = DEFAULT_SETTINGS): {
  players: Player[]
  notes: string[]
  errors: string[]
} {
  const { entries, errors } = parsePositionalCheatSheet(rawCheatSheet)
  const { players, notes } = buildBoardFromPositional(entries, settings)
  return { players, notes, errors }
}

/** Convenience for callers that only want the players. */
export function makeFantasyProsPlayers(settings: LeagueSettings = DEFAULT_SETTINGS): Player[] {
  return makeFantasyProsBoard(settings).players
}
