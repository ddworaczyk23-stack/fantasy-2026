import { describe, expect, it } from 'vitest'
import type { EngineContext, LeagueTeam, Player, Position } from '../../types'
import { DEFAULT_ROSTER, DEFAULT_WEIGHTS } from '../defaults'
import { scoreAvailable } from '../score'

function makePlayer(id: string, name: string, position: Position, overallRank: number, adp: number, tier: number): Player {
  return {
    id,
    name,
    team: 'FA',
    position,
    bye: 6,
    overallRank,
    posRank: overallRank,
    tier,
    adp,
    projPoints: 300 - overallRank,
    upside: 50,
    floor: 50,
    risk: 30,
    notes: '',
    tags: [],
    rationale: '',
    customRank: null,
  }
}

const teams: LeagueTeam[] = Array.from({ length: 12 }, (_, i) => ({
  id: `t${i + 1}`,
  name: `Team ${i + 1}`,
  slot: i + 1,
  isMe: i === 0,
}))

function makeCtx(players: Player[], currentPick: number): EngineContext {
  return {
    players,
    picks: [],
    teams,
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
      pickOwners: null,
      kdstLastRounds: 2,
      allowEarlyKDst: false,
    },
    weights: DEFAULT_WEIGHTS,
    currentPick,
  }
}

describe('valueVsAdp uses the real pick number my board would draft him at', () => {
  it('does not balloon just because many players are already drafted', () => {
    // Only 3 players remain and we are on pick 41 - deep into the draft.
    // The old bug used index-in-remaining-pool (1,2,3) as if it were a real
    // pick number, making a normal player look like a massive 40-pick value.
    const players = [
      makePlayer('a', 'A', 'RB', 41, 41, 4),
      makePlayer('b', 'B', 'WR', 42, 42, 4),
      makePlayer('c', 'C', 'TE', 43, 43, 4),
    ]
    const scored = scoreAvailable(makeCtx(players, 41))
    for (const s of scored) {
      expect(Math.abs(s.valueVsAdp)).toBeLessThan(5)
    }
  })

  it('still flags a real bargain: ADP much later than where my board ranks him', () => {
    const target = makePlayer('bargain', 'Bargain Guy', 'RB', 1, 60, 1)
    const filler = Array.from({ length: 5 }, (_, i) => makePlayer(`f${i}`, `Filler ${i}`, 'WR', 10 + i, 10 + i, 2))
    const scored = scoreAvailable(makeCtx([target, ...filler], 1))
    const found = scored.find((s) => s.player.id === 'bargain')
    expect(found?.valueVsAdp).toBeGreaterThan(50)
  })
})
