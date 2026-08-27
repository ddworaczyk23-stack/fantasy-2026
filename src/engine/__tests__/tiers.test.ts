import { describe, expect, it } from 'vitest'
import type { DraftPick, EngineContext, LeagueTeam, Player, Position, RosterAnalysis } from '../../types'
import { DEFAULT_ROSTER, DEFAULT_WEIGHTS } from '../defaults'
import { getTierAlerts, getTierStates } from '../tiers'

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
    projPoints: 200 - idCounter,
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

function makeTeams(): LeagueTeam[] {
  return [
    { id: 't1', name: 'Me', slot: 1, isMe: true },
    { id: 't2', name: 'Rival', slot: 2, isMe: false },
  ]
}

function makeCtx(players: Player[], picks: DraftPick[] = [], currentPick = 1): EngineContext {
  return {
    players,
    picks,
    teams: makeTeams(),
    settings: {
      teams: 2,
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
    weights: DEFAULT_WEIGHTS,
    currentPick,
  }
}

function neutralRoster(needs: Position[] = []): RosterAnalysis {
  return {
    teamId: 't1',
    counts: { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0, K: 0 },
    starters: [],
    bench: [],
    needs,
    buildStyle: 'Empty',
    byeConflicts: [],
    priorities: { next1: [], next2: [], next3: [] },
    focus: 'value',
    strengths: [],
    vulnerabilities: [],
    starterPoints: 0,
  }
}

describe('getTierStates', () => {
  it('shrinks remaining counts as players are drafted', () => {
    const players = [
      makePlayer('RB', 1),
      makePlayer('RB', 1),
      makePlayer('RB', 1),
      makePlayer('WR', 1),
    ]
    const ctx1 = makeCtx(players)
    const before = getTierStates(ctx1).find((t) => t.position === 'RB' && t.tier === 1)
    expect(before?.remaining).toBe(3)

    const picks: DraftPick[] = [{ pickNumber: 1, round: 1, slot: 1, teamId: 't1', playerId: players[0].id, timestamp: 0 }]
    const ctx2 = makeCtx(players, picks, 2)
    const after = getTierStates(ctx2).find((t) => t.position === 'RB' && t.tier === 1)
    expect(after?.remaining).toBe(2)
  })

  it('marks cliff true at 2 or fewer remaining', () => {
    const players = [makePlayer('WR', 1), makePlayer('WR', 1)]
    const ctx = makeCtx(players)
    const state = getTierStates(ctx).find((t) => t.position === 'WR' && t.tier === 1)
    expect(state?.cliff).toBe(true)

    const players3 = [makePlayer('WR', 1), makePlayer('WR', 1), makePlayer('WR', 1)]
    const ctx3 = makeCtx(players3)
    const state3 = getTierStates(ctx3).find((t) => t.position === 'WR' && t.tier === 1)
    expect(state3?.cliff).toBe(false)
  })
})

describe('getTierAlerts', () => {
  it('fires a critical alert when a needed position current tier has 2 left', () => {
    const players = [
      makePlayer('RB', 1),
      makePlayer('RB', 1),
      makePlayer('WR', 1, { projPoints: 190 }),
      makePlayer('WR', 1, { projPoints: 189 }),
      makePlayer('WR', 1, { projPoints: 188 }),
      makePlayer('WR', 1, { projPoints: 187 }),
      makePlayer('WR', 1, { projPoints: 186 }),
      makePlayer('WR', 1, { projPoints: 185 }),
    ]
    const ctx = makeCtx(players)
    const roster = neutralRoster(['RB', 'WR'])
    const alerts = getTierAlerts(ctx, roster)
    const rbAlert = alerts.find((a) => a.position === 'RB')
    expect(rbAlert?.severity).toBe('critical')
    expect(rbAlert?.message).toMatch(/RB/)
    expect(rbAlert?.message).not.toMatch(/undefined/)
  })

  it('never emits DST/K alerts outside the kdst window', () => {
    const players = [
      makePlayer('DST', 1),
      makePlayer('DST', 1),
      makePlayer('K', 1),
      makePlayer('K', 1),
    ]
    // early pick, well outside the window
    const ctx = makeCtx(players, [], 1)
    const roster = neutralRoster(['DST', 'K'])
    const alerts = getTierAlerts(ctx, roster)
    expect(alerts.find((a) => a.position === 'DST' || a.position === 'K')).toBeUndefined()
  })
})
