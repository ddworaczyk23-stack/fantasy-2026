import { FLEX_POSITIONS } from '../types'
import type {
  DraftRoomRead,
  EngineContext,
  Player,
  Position,
  RosterAnalysis,
  ScoreBreakdown,
  ScoredPlayer,
  TierState,
} from '../types'
import { normalizeWeights } from './defaults'
import { availablePlayers, effectiveRank } from './availability'
import { inKDstWindow, myPickNumbers, myTeam, roundForPick } from './picks'
import { getTierStates } from './tiers'
import { readDraftRoom } from './room'
import { analyzeRoster } from './roster'

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n))
}

function flattenTiers(tiers: TierState[]): Player[] {
  const out: Player[] = []
  for (const ts of tiers) out.push(...ts.players)
  return out
}

function findTierState(tiers: TierState[], position: Position, tier: number): TierState | undefined {
  return tiers.find((t) => t.position === position && t.tier === tier)
}

function mean(players: Player[]): number {
  if (players.length === 0) return 0
  return players.reduce((s, p) => s + p.projPoints, 0) / players.length
}

// ---------------------------------------------------------------------------
// 0-100 component scores
// ---------------------------------------------------------------------------

function consensusScore(player: Player, allAvailable: Player[]): number {
  if (allAvailable.length === 0) return 50
  const ranks = allAvailable.map(effectiveRank)
  const best = Math.min(...ranks)
  const worst = Math.max(...ranks)
  const range = Math.max(1, worst - best)
  return clamp(100 - ((effectiveRank(player) - best) / range) * 100)
}

function opportunityScore(player: Player, allAvailable: Player[], ctx: EngineContext): number {
  const samePos = allAvailable.filter((p) => p.position === player.position)
  const bestProj = Math.max(1, ...samePos.map((p) => p.projPoints))
  const base = (player.projPoints / bestProj) * 100
  let score = clamp(0.7 * base + 0.3 * player.floor)
  if (ctx.settings.scoring === 'ppr') {
    if (player.tags.includes('pass-catcher')) score += 8
    if (player.tags.includes('high-target')) score += 8
  }
  return clamp(score)
}

function scarcityScore(player: Player, tiers: TierState[]): number {
  const ts = findTierState(tiers, player.position, player.tier)
  const remaining = ts?.remaining ?? 1
  const thinness = clamp(100 - remaining * 15)

  const nextTs = findTierState(tiers, player.position, player.tier + 1)
  const currentMean = ts ? mean(ts.players) : player.projPoints
  const nextMean = nextTs ? mean(nextTs.players) : currentMean * 0.85
  const drop = Math.max(0, currentMean - nextMean)
  const dropScore = clamp((drop / Math.max(1, currentMean)) * 100)

  return clamp(0.6 * thinness + 0.4 * dropScore)
}

/** High when the player has already fallen well past ADP; low for a reach. */
function adpValueScore(player: Player, ctx: EngineContext): number {
  const raw = player.adp - ctx.currentPick // positive = ADP later than now
  // Falling (currentPick already past adp, raw negative) scores high.
  return clamp(100 / (1 + Math.exp(raw / 15)))
}

function fitScore(player: Player, roster: RosterAnalysis, ctx: EngineContext): number {
  const pos = player.position
  if (roster.needs.includes(pos)) {
    const idx = roster.needs.indexOf(pos)
    return clamp(100 - idx * 10, 60, 100)
  }
  if (FLEX_POSITIONS.includes(pos)) {
    const flexOpen = roster.starters.some((s) => s.position === 'FLEX' && s.player === null)
    if (flexOpen) return 70
  }
  const starterSlotsForPos = ctx.settings.roster[pos] ?? 0
  const rosteredCount = roster.counts[pos] ?? 0
  const benchCap = starterSlotsForPos + 2
  if (rosteredCount < benchCap) return 40
  return 10
}

function upsideScore(player: Player, ctx: EngineContext): number {
  let s = player.upside
  if (player.tags.includes('handcuff')) s += 8
  if (player.tags.includes('sleeper')) s += 8
  const round = roundForPick(ctx.currentPick, ctx.settings.teams)
  if (round > 8) s *= 1.15
  return clamp(s)
}

function riskPenalty(player: Player, ctx: EngineContext): number {
  let base = player.risk * 0.3
  if (player.tags.includes('injury-concern')) base += 10
  if (player.tags.includes('avoid-at-cost')) base += 8
  const round = roundForPick(ctx.currentPick, ctx.settings.teams)
  const earlyMultiplier = round <= 3 ? 1.2 : round <= 6 ? 1.1 : 1.0
  return -Math.min(35, base * earlyMultiplier)
}

function runAdjustment(player: Player, room: DraftRoomRead): number {
  let bump = 0
  const run = room.runs.find((r) => r.position === player.position)
  if (run?.active) bump += 6
  const gone = room.positionsLikelyGone.find((g) => g.position === player.position)
  if (gone && gone.expected >= 2) bump += 4
  return bump
}

// ---------------------------------------------------------------------------
// Strategy multipliers (applied after the weighted sum). Each documented.
// ---------------------------------------------------------------------------

function bestRankAtPosition(tiers: TierState[], position: Position): number | null {
  const players = flattenTiers(tiers).filter((p) => p.position === position)
  if (players.length === 0) return null
  return Math.min(...players.map(effectiveRank))
}

function strategyMultiplier(
  player: Player,
  ctx: EngineContext,
  roster: RosterAnalysis,
  tiers: TierState[],
): number {
  const round = roundForPick(ctx.currentPick, ctx.settings.teams)
  const { settings } = ctx
  // The K/DST window honours settings.kdstLastRounds (default: the final two).
  const lateWindow = inKDstWindow(ctx)

  // Rule: DST/K score is crushed outside the designated K/DST window.
  const dstKAllowed = lateWindow || settings.allowEarlyKDst
  const dstCrush = (player.position === 'DST' || player.position === 'K') && !dstKAllowed ? 0.05 : 1

  // Rule: in 1QB, QB is damped rounds 1-5 unless he's fallen far past ADP AND
  // is the clear top QB still on the board.
  let qbDamp = 1
  if (player.position === 'QB' && !settings.superflex && round <= 5) {
    const fellFar = ctx.currentPick - player.adp >= 20
    const bestQBRank = bestRankAtPosition(tiers, 'QB')
    const isTopQB = bestQBRank !== null && effectiveRank(player) <= bestQBRank
    if (!(fellFar && isTopQB)) qbDamp = 0.4
  }

  // Rule: a second QB or second TE before the last 3 rounds is damped.
  const lastThreeRounds = round > settings.rounds - 3
  let secondDamp = 1
  if (player.position === 'QB' && roster.counts.QB >= 1 && !lastThreeRounds) secondDamp *= 0.5
  if (player.position === 'TE' && roster.counts.TE >= 1 && !lastThreeRounds) secondDamp *= 0.6

  // Rule: rounds 1-3 favour RB/WR with a small boost.
  let earlyRbWrBoost = 1
  if (round <= 3 && (player.position === 'RB' || player.position === 'WR')) earlyRbWrBoost = 1.08

  // Rule: through round 5, boost RB/WR if the team has fewer than 4 combined.
  let rbWrDepthBoost = 1
  if (round <= 5 && roster.counts.RB + roster.counts.WR < 4 && (player.position === 'RB' || player.position === 'WR')) {
    rbWrDepthBoost = 1.1
  }

  // Rule: mid-to-late rounds boost upside/sleeper/handcuff, damp low-ceiling vets.
  let lateBoost = 1
  if (round > 8) {
    if (player.tags.includes('sleeper') || player.tags.includes('handcuff') || player.upside >= 70) {
      lateBoost = 1.1
    } else if (player.upside < 40 && player.floor > 60) {
      lateBoost = 0.9
    }
  }

  let nonDstMultiplier = qbDamp * secondDamp * earlyRbWrBoost * rbWrDepthBoost * lateBoost

  // Cap: none of the damping rules above may fully bury a player who has
  // fallen 20+ picks past ADP and is alone in his tier — value/tier gaps win.
  const ts = findTierState(tiers, player.position, player.tier)
  const fellHuge = ctx.currentPick - player.adp > 20
  const aloneInTier = (ts?.remaining ?? 99) <= 1
  if (fellHuge && aloneInTier) {
    nonDstMultiplier = Math.max(nonDstMultiplier, 0.75)
  }

  // Rule: endgame legality. D/ST and K are the last slots you fill, but they
  // are mandatory - finishing the draft without them means an illegal lineup.
  // Once the number of picks I have left is no greater than the number of
  // D/ST and K starter slots still empty, nothing else may win. This is a hard
  // constraint, so it is applied AFTER the value/tier cap above.
  const myRemainingPicks = myPickNumbers(settings).filter((p) => p >= ctx.currentPick).length
  const unfilledDstK = roster.starters.filter(
    (s) => s.player === null && (s.position === 'DST' || s.position === 'K'),
  ).length
  let endgameFill = 1
  if (myRemainingPicks > 0 && unfilledDstK >= myRemainingPicks) {
    const fillsMandatory =
      (player.position === 'DST' || player.position === 'K') &&
      roster.starters.some((s) => s.player === null && s.position === player.position)
    endgameFill = fillsMandatory ? 4 : 0.1
  }

  return nonDstMultiplier * dstCrush * endgameFill
}

function buildReasons(
  player: Player,
  ctx: EngineContext,
  roster: RosterAnalysis,
  room: DraftRoomRead,
  tiers: TierState[],
): string[] {
  const reasons: string[] = []
  const ts = findTierState(tiers, player.position, player.tier)
  if (ts && ts.remaining <= 2) {
    reasons.push(
      ts.remaining === 1
        ? `Last player in ${player.position} tier ${player.tier} (1 remains)`
        : `Only ${ts.remaining} players left in ${player.position} tier ${player.tier} (${ts.remaining} remain)`,
    )
  }

  const raw = player.adp - ctx.currentPick
  if (raw < -8) reasons.push(`Going ${Math.round(-raw)} picks past ADP`)
  else if (raw > 15) reasons.push(`Ranked ${Math.round(raw)} picks ahead of ADP (possible reach)`)

  if (roster.needs.includes(player.position)) {
    reasons.push(`Fills an open starter need at ${player.position}`)
  }

  const run = room.runs.find((r) => r.position === player.position)
  if (run?.active) reasons.push(`${player.position} run active (${run.countInWindow} of last ${run.window} picks)`)

  if (reasons.length < 2) reasons.push(`Effective rank ${effectiveRank(player)} overall`)

  return reasons.slice(0, 4)
}

export function scorePlayer(
  player: Player,
  ctx: EngineContext,
  roster: RosterAnalysis,
  tiers: TierState[],
  room: DraftRoomRead,
): ScoredPlayer {
  const allAvailable = flattenTiers(tiers)
  const weights = normalizeWeights(ctx.weights)

  const consensus = consensusScore(player, allAvailable)
  const opportunity = opportunityScore(player, allAvailable, ctx)
  const scarcity = scarcityScore(player, tiers)
  const adpValue = adpValueScore(player, ctx)
  const fit = fitScore(player, roster, ctx)
  const upside = upsideScore(player, ctx)
  const risk = riskPenalty(player, ctx)
  const run = runAdjustment(player, room)

  const weightedSum =
    weights.consensus * consensus +
    weights.opportunity * opportunity +
    weights.scarcity * scarcity +
    weights.adpValue * adpValue +
    weights.fit * fit +
    weights.upside * upside

  const multiplier = strategyMultiplier(player, ctx, roster, tiers)
  const score = clamp((weightedSum + risk + run) * multiplier)

  const breakdown: ScoreBreakdown = {
    consensus,
    opportunity,
    scarcity,
    adpValue,
    fit,
    upside,
    riskPenalty: risk,
    runAdjustment: run,
  }

  const ts = findTierState(tiers, player.position, player.tier)
  const confidence: ScoredPlayer['confidence'] =
    player.risk >= 65 ? 'low' : (ts?.remaining ?? 5) <= 3 && player.risk <= 40 ? 'high' : 'medium'

  const riskFlags: string[] = []
  if (player.notes) riskFlags.push(player.notes)
  if (player.risk > 65) riskFlags.push(`High risk score (${player.risk})`)
  if (player.tags.includes('injury-concern')) riskFlags.push('Tagged injury-concern')
  if (player.tags.includes('avoid-at-cost')) riskFlags.push('Tagged avoid-at-cost')

  const profile: ScoredPlayer['profile'] =
    player.floor > player.upside + 10 ? 'floor' : player.upside > player.floor + 10 ? 'upside' : 'balanced'

  return {
    player,
    score,
    breakdown,
    valueVsAdp: 0,
    fitScore: fit,
    confidence,
    riskFlags,
    reasons: buildReasons(player, ctx, roster, room, tiers),
    profile,
  }
}

export function scoreAvailable(ctx: EngineContext): ScoredPlayer[] {
  const available = availablePlayers(ctx)
  if (available.length === 0) return []

  const me = myTeam(ctx.teams)
  const roster = me ? analyzeRoster(me.id, ctx) : analyzeRoster('__none__', ctx)
  const tiers = getTierStates(ctx)
  const room = readDraftRoom(ctx)

  return available
    .map((p) => scorePlayer(p, ctx, roster, tiers, room))
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ ...s, valueVsAdp: s.player.adp - (i + 1) }))
}
