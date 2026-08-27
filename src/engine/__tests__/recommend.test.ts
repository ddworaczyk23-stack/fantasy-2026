import { describe, expect, it } from 'vitest'
import type { DraftPick, EngineContext, LeagueTeam, Player, Position } from '../../types'
import { DEFAULT_ROSTER, DEFAULT_WEIGHTS } from '../defaults'
import { recommend } from '../recommend'

let idCounter = 0
function makePlayer(position: Position, tier: number, overrides: Partial<Player> = {}): Player {
  idCounter += 1
  return {
    id: `p${idCounter}`,
    name: `Player ${idCounter}`,
    team: 'FA',
    position,
    bye: (idCounter % 14) + 1,
    overallRank: idCounter,
    posRank: idCounter,
    tier,
    adp: idCounter,
    projPoints: 300 - idCounter,
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

function makeCtx(players: Player[], picks: DraftPick[] = [], currentPick = 1): EngineContext {
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
    weights: DEFAULT_WEIGHTS,
    currentPick,
  }
}

function buildPool(): Player[] {
  const players: Player[] = []
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'DST', 'K']
  for (const pos of positions) {
    for (let tier = 1; tier <= 3; tier++) {
      for (let i = 0; i < 5; i++) {
        players.push(
          makePlayer(pos, tier, {
            upside: pos === 'RB' && tier === 1 ? 80 : 40,
            floor: pos === 'WR' && tier === 1 ? 80 : 40,
          }),
        )
      }
    }
  }
  return players
}

describe('recommend', () => {
  it('returns a non-null primary on a fresh board', () => {
    const players = buildPool()
    const ctx = makeCtx(players)
    const rec = recommend(ctx)
    expect(rec.primary).not.toBeNull()
  })

  it('never recommends an already-drafted player', () => {
    const players = buildPool()
    const drafted = players[0]
    const picks: DraftPick[] = [{ pickNumber: 1, round: 1, slot: 1, teamId: 't1', playerId: drafted.id, timestamp: 0 }]
    const ctx = makeCtx(players, picks, 2)
    const rec = recommend(ctx)
    expect(rec.primary?.player.id).not.toBe(drafted.id)
    for (const alt of rec.alternatives) {
      expect(alt.player.id).not.toBe(drafted.id)
    }
  })

  it('diversifies alternatives across positions', () => {
    const players = buildPool()
    const ctx = makeCtx(players)
    const rec = recommend(ctx)
    const positions = new Set(rec.alternatives.map((a) => a.player.position))
    expect(positions.size).toBeGreaterThanOrEqual(2)
  })

  it('produces a non-empty strategyExplanation that names the primary player', () => {
    const players = buildPool()
    const ctx = makeCtx(players)
    const rec = recommend(ctx)
    expect(rec.strategyExplanation.length).toBeGreaterThan(0)
    expect(rec.primary).not.toBeNull()
    if (rec.primary) {
      expect(rec.strategyExplanation).toContain(rec.primary.player.name)
    }
  })

  it('does not throw when every player is drafted', () => {
    const players = buildPool()
    const picks: DraftPick[] = players.map((p, i) => ({
      pickNumber: i + 1,
      round: 1,
      slot: (i % 12) + 1,
      teamId: `t${(i % 12) + 1}`,
      playerId: p.id,
      timestamp: 0,
    }))
    const ctx = makeCtx(players, picks, players.length + 1)
    expect(() => recommend(ctx)).not.toThrow()
    const rec = recommend(ctx)
    expect(rec.primary).toBeNull()
    expect(rec.alternatives).toEqual([])
  })
})
