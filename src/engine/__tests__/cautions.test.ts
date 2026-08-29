import { describe, expect, it } from 'vitest'
import type { DraftPick, EngineContext, LeagueTeam, Player, Position, ScoredPlayer } from '../../types'
import { DEFAULT_ROSTER, DEFAULT_WEIGHTS } from '../defaults'
import { getCautions } from '../cautions'

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

function makeCtx(players: Player[], picks: DraftPick[], currentPick: number): EngineContext {
  return {
    players,
    picks,
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

/** Score order matching board rank, which is the neutral case for these tests. */
function scoreByRank(players: Player[], drafted: Set<string>): ScoredPlayer[] {
  return players
    .filter((p) => !drafted.has(p.id))
    .slice()
    .sort((a, b) => a.overallRank - b.overallRank)
    .map((player) => ({ player, score: 100 - player.overallRank }) as ScoredPlayer)
}

describe('ADP cautions compare real pick numbers', () => {
  // 60 filler players so the board is deep enough to draft from.
  const pool: Player[] = Array.from({ length: 60 }, (_, i) =>
    makePlayer(`f${i + 1}`, `Filler ${i + 1}`, 'WR', i + 1, i + 1, Math.ceil((i + 1) / 12)),
  )
  // The market takes him at 45; my board says 75. That is a real 30-pick gap.
  const late = makePlayer('late', 'Late Value Guy', 'RB', 75, 45, 5)
  const players = [...pool, late]

  it('quotes his real ADP, not his place in the remaining list', () => {
    const drafted = new Set(pool.slice(0, 40).map((p) => p.id))
    const picks: DraftPick[] = pool.slice(0, 40).map((p, i) => ({
      pickNumber: i + 1,
      round: Math.floor(i / 12) + 1,
      slot: (i % 12) + 1,
      teamId: `t${(i % 12) + 1}`,
      playerId: p.id,
      timestamp: 0,
    }))
    const ctx = makeCtx(players, picks, 41)
    const found = getCautions(ctx, scoreByRank(players, drafted)).find((c) => c.playerId === 'late')

    expect(found).toBeDefined()
    expect(found?.message).toContain('ADP pick 45')
    // The old bug reported his index among what was left, which was near 1.
    expect(found?.message).not.toContain('ADP pick 1,')
  })

  it('stays quiet when my board likes him more than the market does', () => {
    const cheap = makePlayer('cheap', 'Cheap Guy', 'RB', 20, 90, 2)
    const ctx = makeCtx([...pool, cheap], [], 1)
    const cautions = getCautions(ctx, scoreByRank([...pool, cheap], new Set()))
    expect(cautions.find((c) => c.playerId === 'cheap')).toBeUndefined()
  })
})
