import { describe, expect, it } from 'vitest'
import type { DraftPick, EngineContext, LeagueTeam, Player, Position } from '../../types'
import { DEFAULT_ROSTER, DEFAULT_WEIGHTS } from '../defaults'
import { canIWait, survivalProbability } from '../wait'

let idCounter = 0
function makePlayer(position: Position, overrides: Partial<Player> = {}): Player {
  idCounter += 1
  return {
    id: `p${idCounter}`,
    name: `Player ${idCounter}`,
    team: 'FA',
    position,
    bye: 7,
    overallRank: idCounter,
    posRank: idCounter,
    tier: 1,
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

function makeCtx(opts: {
  players: Player[]
  picks?: DraftPick[]
  currentPick?: number
  myPickOverrides?: number[] | null
}): EngineContext {
  return {
    players: opts.players,
    picks: opts.picks ?? [],
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
      myPickOverrides: opts.myPickOverrides ?? null,
      pickOwners: null,
      kdstLastRounds: 2,
      allowEarlyKDst: false,
    },
    weights: DEFAULT_WEIGHTS,
    currentPick: opts.currentPick ?? 1,
  }
}

describe('survivalProbability / canIWait', () => {
  it('is 1 when picksUntilNext is 0', () => {
    const player = makePlayer('WR')
    const ctx = makeCtx({ players: [player], myPickOverrides: [1], currentPick: 1 })
    expect(survivalProbability(player, ctx)).toBe(1)
  })

  it('marks a player as safe-to-wait when ADP is far past my next pick', () => {
    // DST is never a roster "need" outside the kdst window, keeping this test
    // isolated from roster-fill noise.
    const player = makePlayer('DST', { adp: 200 })
    const ctx = makeCtx({ players: [player], currentPick: 1 })
    const result = canIWait(player, ctx)
    expect(result.survivalProbability).toBeGreaterThan(0.7)
    expect(result.verdict).toBe('safe-to-wait')
  })

  it('marks a player as take-now when ADP is before my next pick', () => {
    const player = makePlayer('DST', { adp: 5 })
    const ctx = makeCtx({ players: [player], currentPick: 1 })
    const result = canIWait(player, ctx)
    expect(result.survivalProbability).toBeLessThan(0.25)
    expect(result.verdict).toBe('take-now')
  })

  it('drops when intervening teams still need that position', () => {
    const target = makePlayer('WR', { adp: 300 })

    // Case A: every other team already has 2 WRs -> no WR need.
    const fillers: Player[] = []
    const picksA: DraftPick[] = []
    for (let t = 2; t <= 12; t++) {
      for (let w = 0; w < 2; w++) {
        const p = makePlayer('WR', { projPoints: 100 })
        fillers.push(p)
        picksA.push({ pickNumber: 1000 + fillers.length, round: 1, slot: t, teamId: `t${t}`, playerId: p.id, timestamp: 0 })
      }
    }
    // push a few dummy DST picks to the end so the run-detection window
    // (last 8 picks) doesn't see the WR fill picks.
    const dummies: Player[] = []
    for (let i = 0; i < 8; i++) {
      const d = makePlayer('DST', { projPoints: 1 })
      dummies.push(d)
      picksA.push({ pickNumber: 2000 + i, round: 1, slot: 2, teamId: 't2', playerId: d.id, timestamp: 0 })
    }
    const ctxA = makeCtx({ players: [target, ...fillers, ...dummies], picks: picksA, currentPick: 1 })

    // Case B: nobody has drafted a WR -> every team needs WR.
    const dummiesB: Player[] = []
    const picksB: DraftPick[] = []
    for (let i = 0; i < 8; i++) {
      const d = makePlayer('DST', { projPoints: 1 })
      dummiesB.push(d)
      picksB.push({ pickNumber: 2000 + i, round: 1, slot: 2, teamId: 't2', playerId: d.id, timestamp: 0 })
    }
    const ctxB = makeCtx({ players: [target, ...dummiesB], picks: picksB, currentPick: 1 })

    const probA = survivalProbability(target, ctxA)
    const probB = survivalProbability(target, ctxB)
    expect(probA).toBeGreaterThan(probB)
  })
})
