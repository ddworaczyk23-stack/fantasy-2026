import type { EngineContext, Player, WaitAnalysis, WaitVerdict } from '../types'
import { picksUntilNext } from './picks'
import { readDraftRoom } from './room'

/** Probability (0.02..0.98) that `player` is still available at my next pick. */
export function survivalProbability(player: Player, ctx: EngineContext): number {
  const pn = picksUntilNext(ctx)
  if (pn === 0) return 1

  const nextPickNumber = ctx.currentPick + pn
  const gap = player.adp - nextPickNumber
  // ADP uncertainty widens later in the draft.
  const sigma = 6 + ctx.currentPick / 15
  let prob = 1 / (1 + Math.exp(-gap / sigma))

  const room = readDraftRoom(ctx)
  const needingTeams = room.teamsBeforeNextPick.filter((t) => t.needs.includes(player.position)).length
  prob -= needingTeams * 0.06

  const run = room.runs.find((r) => r.position === player.position)
  if (run?.active) prob -= 0.15

  return Math.min(0.98, Math.max(0.02, prob))
}

export function canIWait(player: Player, ctx: EngineContext): WaitAnalysis {
  const prob = survivalProbability(player, ctx)

  let verdict: WaitVerdict
  if (prob < 0.25) verdict = 'take-now'
  else if (prob < 0.45) verdict = 'likely-gone'
  else if (prob <= 0.7) verdict = 'possible-value-next-round'
  else verdict = 'safe-to-wait'

  const pn = picksUntilNext(ctx)
  const nextPickNumber = ctx.currentPick + pn
  const room = readDraftRoom(ctx)
  const needingTeams = room.teamsBeforeNextPick.filter((t) => t.needs.includes(player.position)).length
  const run = room.runs.find((r) => r.position === player.position)
  const runText = run?.active ? `, and a ${player.position} run is active` : ''

  const explanation =
    pn === 0
      ? `You are on the clock right now, so ${player.name} is available at ${(prob * 100).toFixed(0)}% survival if you pass.`
      : `You have ${pn} pick${pn === 1 ? '' : 's'} until your next selection (pick ${nextPickNumber}), and ${player.name}'s ADP is ${player.adp.toFixed(1)}. ${needingTeams} team${needingTeams === 1 ? '' : 's'} picking before you need ${player.position}${runText}.`

  return {
    playerId: player.id,
    playerName: player.name,
    position: player.position,
    verdict,
    survivalProbability: prob,
    picksUntilNext: pn,
    explanation,
  }
}
