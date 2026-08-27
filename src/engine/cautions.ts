import type { Caution, EngineContext, ScoredPlayer } from '../types'
import { availablePlayers, effectiveRank } from './availability'
import { getTierStates } from './tiers'

const ADP_WINDOW = 15
const GAP_THRESHOLD = 15
const CRITICAL_GAP = 28
const REACH_GUARD = 12

function realisticRange(ctx: EngineContext, playerId: string): string {
  const tiers = getTierStates(ctx)
  const player = ctx.players.find((p) => p.id === playerId)
  if (!player) return 'Realistic range: unknown'
  const ts = tiers.find((t) => t.position === player.position && t.tier === player.tier)
  const ranks = (ts?.players ?? [player]).map(effectiveRank)
  const low = Math.min(...ranks)
  const high = Math.max(...ranks)
  return `Realistic range: picks ${low}-${high}`
}

export function getCautions(ctx: EngineContext, scored: ScoredPlayer[]): Caution[] {
  const cautions: Caution[] = []
  const flagged = new Set<string>()

  const scoreRankById = new Map<string, number>()
  scored.forEach((s, i) => scoreRankById.set(s.player.id, i + 1))

  const adpOrder = availablePlayers(ctx)
    .slice()
    .sort((a, b) => a.adp - b.adp)
    .slice(0, ADP_WINDOW)

  adpOrder.forEach((player, i) => {
    const adpIndex = i + 1
    const scoreRank = scoreRankById.get(player.id) ?? adpIndex
    const effRank = effectiveRank(player)
    const gap = Math.max(scoreRank - adpIndex, effRank - adpIndex)
    if (gap < GAP_THRESHOLD) return

    flagged.add(player.id)
    cautions.push({
      playerId: player.id,
      playerName: player.name,
      severity: gap >= CRITICAL_GAP ? 'critical' : 'warn',
      message: `${player.name} is going around ADP pick ${adpIndex.toFixed(0)}, but your board has him closer to rank ${effRank} (tier ${player.tier}) — the market is well ahead of your value here.`,
      realisticRange: realisticRange(ctx, player.id),
    })
  })

  // Accidental-reach guard: even the current top-scored player can be a reach.
  if (scored.length > 0) {
    const top = scored[0]
    const reach = top.player.adp - ctx.currentPick
    if (reach >= REACH_GUARD && !flagged.has(top.player.id)) {
      flagged.add(top.player.id)
      cautions.push({
        playerId: top.player.id,
        playerName: top.player.name,
        severity: reach >= 25 ? 'critical' : 'warn',
        message: `${top.player.name} currently scores highest, but his ADP (${top.player.adp.toFixed(1)}) is ${Math.round(reach)} picks later than pick ${ctx.currentPick} — taking him now is a reach versus the market.`,
        realisticRange: realisticRange(ctx, top.player.id),
      })
    }
  }

  return cautions.slice(0, 5)
}
