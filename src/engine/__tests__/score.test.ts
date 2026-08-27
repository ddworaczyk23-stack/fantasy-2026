import { describe, expect, it } from 'vitest'
import type { DraftPick, EngineContext, LeagueTeam, Player, Position, Weights } from '../../types'
import { DEFAULT_ROSTER, DEFAULT_WEIGHTS } from '../defaults'
import { scoreAvailable, scorePlayer } from '../score'
import { getTierStates } from '../tiers'
import { analyzeRoster } from '../roster'
import { readDraftRoom } from '../room'

let idCounter = 0
function makePlayer(position: Position, tier: number, overrides: Partial<Player> = {}): Player {
  idCounter += 1
  return {
    id: `p${idCounter}`,
    name: `Player ${idCounter}`,
    team: 'FA',
    position,
    bye: 7,
    overallRank: idCounter,
    posRank: idCounter,
    tier,
    adp: idCounter,
    projPoints: 150,
    upside: 50,
    floor: 50,
    risk: 30,
    notes: '',
    tags: [],
    rationale: '',
    customRank: null,
    ...overrides,
  }
}

function makeTeams(n: number): LeagueTeam[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    name: `Team ${i + 1}`,
    slot: i + 1,
    isMe: i === 0,
  }))
}

function makeCtx(players: Player[], currentPick: number, weights: Weights = DEFAULT_WEIGHTS, picks: DraftPick[] = []): EngineContext {
  return {
    players,
    picks,
    teams: makeTeams(12),
    settings: {
      teams: 12,
      scoring: 'ppr',
      superflex: false,
      rounds: 15,
      snake: true,
      thirdRoundReversal: false,
      mySlot: 1,
      roster: DEFAULT_ROSTER,
      myPickOverrides: null,
      kdstLastRounds: 2,
      allowEarlyKDst: false,
    },
    weights,
    currentPick,
  }
}

describe('scoreAvailable strategy rules', () => {
  it('never lets DST/K win before the final two rounds', () => {
    const players = [
      makePlayer('DST', 1, { projPoints: 400, overallRank: 1, adp: 1 }),
      makePlayer('K', 1, { projPoints: 400, overallRank: 2, adp: 2 }),
      makePlayer('RB', 1, { projPoints: 250, overallRank: 3, adp: 3 }),
      makePlayer('WR', 1, { projPoints: 240, overallRank: 4, adp: 4 }),
      makePlayer('QB', 1, { projPoints: 300, overallRank: 5, adp: 5 }),
    ]
    const ctx = makeCtx(players, 1)
    const scored = scoreAvailable(ctx)
    expect(scored[0].player.position).not.toBe('DST')
    expect(scored[0].player.position).not.toBe('K')
  })

  it('does not let a QB win round 1 on a normal 1QB board', () => {
    const players = [
      makePlayer('QB', 1, { projPoints: 380, overallRank: 1, adp: 1, upside: 90 }),
      makePlayer('RB', 1, { projPoints: 260, overallRank: 2, adp: 2 }),
      makePlayer('RB', 1, { projPoints: 255, overallRank: 3, adp: 3 }),
      makePlayer('WR', 1, { projPoints: 250, overallRank: 4, adp: 4 }),
      makePlayer('WR', 1, { projPoints: 245, overallRank: 5, adp: 5 }),
    ]
    const ctx = makeCtx(players, 1)
    const scored = scoreAvailable(ctx)
    expect(scored[0].player.position).not.toBe('QB')
  })

  it('has a falling elite WR outscore a same-tier WR sitting right at ADP', () => {
    const fallingWR = makePlayer('WR', 2, { adp: 20, projPoints: 200, overallRank: 25 })
    const atAdpWR = makePlayer('WR', 2, { adp: 50, projPoints: 200, overallRank: 25 })
    const filler = [makePlayer('RB', 1, { adp: 10 }), makePlayer('RB', 2, { adp: 30 })]
    const players = [fallingWR, atAdpWR, ...filler]
    const ctx = makeCtx(players, 50)

    const roster = analyzeRoster('t1', ctx)
    const tiers = getTierStates(ctx)
    const room = readDraftRoom(ctx)

    const scoredFalling = scorePlayer(fallingWR, ctx, roster, tiers, room)
    const scoredAtAdp = scorePlayer(atAdpWR, ctx, roster, tiers, room)

    expect(scoredFalling.score).toBeGreaterThan(scoredAtAdp.score)
  })

  it('lets weights change the ranking: adpValue=1.0 makes the biggest faller win', () => {
    const bigFaller = makePlayer('RB', 2, { adp: 20, projPoints: 200 })
    const nearAdp = makePlayer('RB', 2, { adp: 48, projPoints: 200 })
    const players = [bigFaller, nearAdp]
    const adpOnlyWeights: Weights = { consensus: 0, opportunity: 0, scarcity: 0, adpValue: 1, fit: 0, upside: 0 }
    const ctx = makeCtx(players, 50, adpOnlyWeights)

    const roster = analyzeRoster('t1', ctx)
    const tiers = getTierStates(ctx)
    const room = readDraftRoom(ctx)

    const scoredFaller = scorePlayer(bigFaller, ctx, roster, tiers, room)
    const scoredNear = scorePlayer(nearAdp, ctx, roster, tiers, room)

    expect(scoredFaller.score).toBeGreaterThan(scoredNear.score)
  })
})
