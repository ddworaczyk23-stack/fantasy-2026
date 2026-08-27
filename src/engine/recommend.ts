import type { EngineContext, Recommendation, ScoredPlayer } from '../types'
import { effectiveRank } from './availability'
import { isMyPick, myPickAfter, myTeam, nextMyPickFrom, picksUntilNext, roundForPick, teamForPick } from './picks'
import { getTierAlerts, getTierStates } from './tiers'
import { analyzeRoster } from './roster'
import { readDraftRoom } from './room'
import { scoreAvailable } from './score'
import { getCautions } from './cautions'
import { canIWait } from './wait'

function diversifyAlternatives(scored: ScoredPlayer[], primaryId: string | null): ScoredPlayer[] {
  const pool = scored.filter((s) => s.player.id !== primaryId)
  if (pool.length <= 5) return pool.slice(0, 5)

  let picks = pool.slice(0, 5)
  const usedIds = new Set(picks.map((p) => p.player.id))

  const ensure = (predicate: (s: ScoredPlayer) => boolean) => {
    if (picks.some(predicate)) return
    const candidate = pool.find((s) => !usedIds.has(s.player.id) && predicate(s))
    if (!candidate) return
    const removed = picks[picks.length - 1]
    if (removed) usedIds.delete(removed.player.id)
    picks = [...picks.slice(0, -1), candidate]
    usedIds.add(candidate.player.id)
  }

  const distinctPositions = () => new Set(picks.map((p) => p.player.position)).size
  if (distinctPositions() < 2) {
    const primaryPos = picks[0]?.player.position
    ensure((s) => s.player.position !== primaryPos)
  }
  ensure((s) => s.profile === 'floor')
  ensure((s) => s.profile === 'upside')

  return picks.sort((a, b) => b.score - a.score)
}

function buildStrategyExplanation(
  ctx: EngineContext,
  onTheClock: boolean,
  primary: ScoredPlayer | null,
  alternatives: ScoredPlayer[],
  myNextPick: number | null,
): string {
  if (!primary) return 'No players remain available to recommend.'

  if (!onTheClock) {
    const team = teamForPick(ctx.currentPick, ctx.teams, ctx.settings)
    const tiers = getTierStates(ctx)
    const roster = (() => {
      const me = myTeam(ctx.teams)
      return me ? analyzeRoster(me.id, ctx) : analyzeRoster('__none__', ctx)
    })()
    const alerts = getTierAlerts(ctx, roster)
    const room = readDraftRoom(ctx)
    const activeRun = room.runs.find((r) => r.active)
    const watch = alerts[0]?.message ?? (activeRun ? `${activeRun.position} run is active.` : 'No urgent tier or run signals right now.')
    void tiers
    return `${team ? team.name : 'Another team'} is on the clock at pick ${ctx.currentPick}. Watch: ${watch}`
  }

  const me = myTeam(ctx.teams)
  const roster = me ? analyzeRoster(me.id, ctx) : analyzeRoster('__none__', ctx)
  const tiers = getTierStates(ctx)
  const room = readDraftRoom(ctx)

  const player = primary.player
  const ts = tiers.find((t) => t.position === player.position && t.tier === player.tier)
  const tierPhrase = ts
    ? ts.remaining <= 1
      ? `the final player in ${player.position} tier ${player.tier}`
      : `one of ${ts.remaining} remaining in ${player.position} tier ${player.tier}`
    : `ranked ${effectiveRank(player)} on your board`

  const posCount = roster.counts[player.position] ?? 0
  const rosterCountPhrase = `your roster has ${posCount} ${player.position}${posCount === 1 ? '' : 's'}`

  const teamsNeeding = room.teamsBeforeNextPick.filter((t) => t.needs.includes(player.position)).length
  const teamsPhrase =
    teamsNeeding > 0
      ? `, ${teamsNeeding} team${teamsNeeding === 1 ? '' : 's'} before your next pick need${teamsNeeding === 1 ? 's' : ''} a ${player.position}`
      : ''

  const nextPickNum = myNextPick ?? ctx.currentPick
  const deltaNext = nextPickNum - player.adp
  const adpPhrase =
    deltaNext > 0
      ? `he is going ${Math.round(deltaNext)} picks earlier than your next selection based on ADP`
      : `his ADP suggests he may still be there at your next selection`

  let sentence = `Recommendation: Draft ${player.name}. Reason: this is ${tierPhrase}, ${rosterCountPhrase}${teamsPhrase}, and ${adpPhrase}.`

  if (alternatives.length > 0) {
    const alt = alternatives[0]
    sentence += ` Comparable ${alt.player.position} value should remain available.`
  }

  return sentence
}

export function recommend(ctx: EngineContext): Recommendation {
  const onTheClock = isMyPick(ctx.currentPick, ctx.settings)
  const round = roundForPick(ctx.currentPick, ctx.settings.teams)
  const myNextPick = onTheClock
    ? myPickAfter(ctx.currentPick, ctx.settings)
    : nextMyPickFrom(ctx.currentPick, ctx.settings)

  const scored = scoreAvailable(ctx)
  const primary = scored[0] ?? null
  const alternatives = diversifyAlternatives(scored, primary?.player.id ?? null)

  const subjects = primary ? [primary, ...alternatives] : alternatives
  const waitAnalysis = subjects.map((s) => canIWait(s.player, ctx))

  const me = myTeam(ctx.teams)
  const roster = me ? analyzeRoster(me.id, ctx) : analyzeRoster('__none__', ctx)
  const tierAlerts = getTierAlerts(ctx, roster)
  const roomRead = readDraftRoom(ctx)
  const cautions = getCautions(ctx, scored)

  const strategyExplanation = buildStrategyExplanation(ctx, onTheClock, primary, alternatives, myNextPick)

  return {
    onTheClock,
    currentPick: ctx.currentPick,
    round,
    myNextPick,
    picksUntilNext: picksUntilNext(ctx),
    primary,
    alternatives,
    waitAnalysis,
    tierAlerts,
    roster,
    roomRead,
    cautions,
    strategyExplanation,
  }
}
