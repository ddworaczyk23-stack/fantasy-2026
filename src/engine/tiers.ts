import { FLEX_POSITIONS, POSITIONS } from '../types'
import type { EngineContext, Player, Position, RosterAnalysis, TierAlert, TierState } from '../types'
import { availablePlayers } from './availability'
import { inKDstWindow, picksUntilNext, roundForPick } from './picks'

function posLabel(pos: Position, count: number): string {
  return count === 1 ? pos : `${pos}s`
}

/** Every (position, tier) that still has available players, sorted by position then tier. */
export function getTierStates(ctx: EngineContext): TierState[] {
  const available = availablePlayers(ctx)
  const groups = new Map<string, Player[]>()
  for (const p of available) {
    const key = `${p.position}|${p.tier}`
    const arr = groups.get(key)
    if (arr) arr.push(p)
    else groups.set(key, [p])
  }
  const states: TierState[] = []
  for (const [key, players] of groups) {
    const [position, tierStr] = key.split('|')
    const tier = Number(tierStr)
    states.push({
      position: position as Position,
      tier,
      remaining: players.length,
      players,
      cliff: players.length <= 2,
    })
  }
  states.sort((a, b) => {
    const pa = POSITIONS.indexOf(a.position)
    const pb = POSITIONS.indexOf(b.position)
    if (pa !== pb) return pa - pb
    return a.tier - b.tier
  })
  return states
}

/** The lowest-numbered (best) tier that still has available players, per position. */
function currentTierByPosition(states: TierState[]): Map<Position, TierState> {
  const map = new Map<Position, TierState>()
  for (const s of states) {
    const existing = map.get(s.position)
    if (!existing || s.tier < existing.tier) map.set(s.position, s)
  }
  return map
}

export function getTierAlerts(ctx: EngineContext, roster: RosterAnalysis): TierAlert[] {
  const states = getTierStates(ctx)
  const current = currentTierByPosition(states)
  const window = inKDstWindow(ctx)
  const round = roundForPick(ctx.currentPick, ctx.settings.teams)
  const gap = picksUntilNext(ctx)

  // A thin tier is only newsworthy relative to how long I have to wait. If I
  // pick again immediately, nothing is about to be taken away from me.
  const riskThreshold = Math.max(2, Math.round(gap * 0.35))

  /**
   * Which positions may be the subject of an alert.
   * QB is excluded in a 1-QB league until the endgame - telling a 1-QB drafter
   * to "prioritise QB" in the early rounds contradicts the engine's own QB
   * damping and is simply bad advice. DST/K only inside their window.
   */
  const alertable = (pos: Position): boolean => {
    if (pos === 'DST' || pos === 'K') return window
    if (pos === 'QB') {
      if (ctx.settings.superflex) return true
      return roster.needs.includes('QB') && round > ctx.settings.rounds - 5
    }
    return true
  }

  const alerts: TierAlert[] = []

  for (const [position, ts] of current) {
    if (!alertable(position)) continue

    const remaining = ts.remaining
    const isNeed = roster.needs.includes(position)
    if (remaining > riskThreshold && remaining > 2) continue

    let severity: TierAlert['severity']
    if (remaining <= 2 && isNeed) severity = 'critical'
    else if (isNeed) severity = 'warn'
    else severity = 'info'

    // Comparator: only positions that actually compete for the same roster
    // spot (the FLEX group). Comparing an RB cliff against QB supply is
    // meaningless - you cannot start a QB in your RB slot.
    let comparison: { position: Position; remaining: number } | null = null
    if (FLEX_POSITIONS.includes(position)) {
      for (const other of FLEX_POSITIONS) {
        if (other === position) continue
        const otherTs = current.get(other)
        if (!otherTs) continue
        if (!comparison || otherTs.remaining > comparison.remaining) {
          comparison = { position: other, remaining: otherTs.remaining }
        }
      }
    }

    // Only frame an alert as a priority when the engine actually wants that
    // position next. An empty roster makes EVERY position an "unfilled need",
    // so `needs` alone would put a priority stamp on whichever tier happened to
    // be thinnest - which at pick 1 produced "TE should be the priority".
    const isTopPriority = roster.priorities.next1.includes(position)
    const closer = isTopPriority
      ? `${position} should be the priority if you want one from this tier.`
      : isNeed
        ? `You still need ${position}, but it is not the top priority at this pick.`
        : `You do not need ${position} yet, so this is context, not a call to act.`

    const message = comparison
      ? `Only ${remaining} ${posLabel(position, remaining)} left in your current value tier (${position} tier ${ts.tier}), but ${comparison.remaining} comparable ${posLabel(comparison.position, comparison.remaining)} left. ${closer}`
      : `Only ${remaining} ${posLabel(position, remaining)} left in your current value tier (${position} tier ${ts.tier}). ${closer}`

    alerts.push({ position, tier: ts.tier, remaining, severity, message })
  }

  const rank = { critical: 0, warn: 1, info: 2 }
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || a.remaining - b.remaining)
  return alerts.slice(0, 3)
}
