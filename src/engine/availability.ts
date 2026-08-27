import type { DraftPick, EngineContext, Player } from '../types'

/** Set of every playerId that has been drafted. */
export function draftedPlayerIds(picks: DraftPick[]): Set<string> {
  const out = new Set<string>()
  for (const p of picks) out.add(p.playerId)
  return out
}

/** Rank actually used for sorting/scoring: user override wins over consensus. */
export function effectiveRank(p: Player): number {
  return p.customRank ?? p.overallRank
}

/** Undrafted players, sorted by effectiveRank ascending (best first). */
export function availablePlayers(ctx: EngineContext): Player[] {
  const drafted = draftedPlayerIds(ctx.picks)
  return ctx.players
    .filter((p) => !drafted.has(p.id))
    .sort((a, b) => effectiveRank(a) - effectiveRank(b))
}
