import { describe, it, expect } from 'vitest'
import { makeFantasyProsPlayers } from '../../data/fantasyProsBoard'
import { DEFAULT_SETTINGS } from '../../engine/defaults'
import { initialKey, matchPlayer, reconcilePicks } from '../../services/sleeperSync'
import { makeSampleTeams } from '../../data/sampleLeague'
import type { SleeperDraftPick } from '../../services/sleeperAdapter'

const BOARD = makeFantasyProsPlayers(DEFAULT_SETTINGS)
const TEAMS = makeSampleTeams(12, 8)

function sPick(n: number, name: string, position: string, team: string): SleeperDraftPick {
  return {
    pickNumber: n,
    round: Math.ceil(n / 12),
    slot: ((n - 1) % 12) + 1,
    rosterId: '1',
    pickedBy: 'u1',
    playerName: name,
    position,
    team,
  }
}

describe('initialKey', () => {
  it('collapses an abbreviated first name onto the full one', () => {
    expect(initialKey('P. Mahomes II')).toBe(initialKey('Patrick Mahomes'))
    expect(initialKey('A. St. Brown')).toBe(initialKey('Amon-Ra St. Brown'))
    expect(initialKey('J. Smith-Njigba')).toBe(initialKey('Jaxon Smith-Njigba'))
    expect(initialKey('C. McCaffrey')).toBe(initialKey('Christian McCaffrey'))
  })

  it('does not collapse two different people', () => {
    expect(initialKey('J. Taylor')).not.toBe(initialKey('Jonathan Jefferson'))
    expect(initialKey('Josh Allen')).not.toBe(initialKey('Braelon Allen'))
  })
})

describe('Sleeper picks against the real FantasyPros board', () => {
  // Sleeper always sends full names; this board is abbreviated in places.
  const cases: { sleeper: string; position: string; team: string; expected: string }[] = [
    { sleeper: "Ja'Marr Chase", position: 'WR', team: 'CIN', expected: "Ja'Marr Chase" },
    { sleeper: 'Jahmyr Gibbs', position: 'RB', team: 'DET', expected: 'Jahmyr Gibbs' },
    { sleeper: 'Christian McCaffrey', position: 'RB', team: 'SF', expected: 'C. McCaffrey' },
    { sleeper: 'Jonathan Taylor', position: 'RB', team: 'IND', expected: 'J. Taylor' },
    { sleeper: 'Patrick Mahomes', position: 'QB', team: 'KC', expected: 'P. Mahomes II' },
    { sleeper: 'Amon-Ra St. Brown', position: 'WR', team: 'DET', expected: 'A. St. Brown' },
    { sleeper: 'Jaxon Smith-Njigba', position: 'WR', team: 'SEA', expected: 'J. Smith-Njigba' },
    { sleeper: 'Justin Jefferson', position: 'WR', team: 'MIN', expected: 'J. Jefferson' },
    { sleeper: 'Matthew Stafford', position: 'QB', team: 'LAR', expected: 'M. Stafford' },
    { sleeper: 'Kenneth Walker', position: 'RB', team: 'KC', expected: 'K. Walker III' },
    { sleeper: 'Brock Bowers', position: 'TE', team: 'LV', expected: 'Brock Bowers' },
    { sleeper: 'Brandon Aubrey', position: 'K', team: 'DAL', expected: 'Brandon Aubrey' },
  ]

  for (const c of cases) {
    it(`matches ${c.sleeper}`, () => {
      const r = matchPlayer(sPick(1, c.sleeper, c.position, c.team), BOARD)
      expect(r.player, `${c.sleeper} did not match anything`).not.toBeNull()
      expect(r.player!.name).toBe(c.expected)
      expect(r.player!.position).toBe(c.position)
    })
  }

  it('matches defenses by team even though the names differ', () => {
    const r = matchPlayer(sPick(1, 'Houston Texans', 'DST', 'HOU'), BOARD)
    expect(r.player!.name).toBe('Houston Texans')
    const r2 = matchPlayer(sPick(1, 'Los Angeles Rams', 'DST', 'LAR'), BOARD)
    expect(r2.player!.name).toBe('L. Angeles Rams')
    expect(r2.how).toBe('team-defense')
  })

  it('refuses to guess when the team does not agree on an abbreviated name', () => {
    // right surname and initial, wrong team -> no match rather than a wrong one
    const r = matchPlayer(sPick(1, 'Patrick Mahomes', 'QB', 'BUF'), BOARD)
    expect(r.player).toBeNull()
  })

  it('reconciles a realistic opening round with nothing unmatched', () => {
    const feed = [
      sPick(1, 'Jahmyr Gibbs', 'RB', 'DET'),
      sPick(2, "Ja'Marr Chase", 'WR', 'CIN'),
      sPick(3, 'Bijan Robinson', 'RB', 'ATL'),
      sPick(4, 'Christian McCaffrey', 'RB', 'SF'),
      sPick(5, 'Puka Nacua', 'WR', 'LAR'),
      sPick(6, 'Jaxon Smith-Njigba', 'WR', 'SEA'),
      sPick(7, 'Jonathan Taylor', 'RB', 'IND'),
      sPick(8, 'Amon-Ra St. Brown', 'WR', 'DET'),
    ]
    const res = reconcilePicks(feed, BOARD, TEAMS, DEFAULT_SETTINGS)
    expect(res.unmatched).toEqual([])
    expect(res.matched).toBe(8)
    expect(new Set(res.picks.map((p) => p.playerId)).size).toBe(8)
  })
})
