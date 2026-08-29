import { describe, it, expect } from 'vitest'
import type { LeagueTeam, Player, Position } from '../../types'
import { DEFAULT_SETTINGS } from '../../engine/defaults'
import { makeSampleTeams } from '../../data/sampleLeague'
import {
  importLeague,
  matchPlayer,
  normalizeName,
  reconcilePicks,
  rosterSlotsFromSleeper,
} from '../../services/sleeperSync'
import { scoringFromSettings, normalizeSleeperPosition, type SleeperDraftPick } from '../../services/sleeperAdapter'

function player(name: string, position: Position, team: string, rank: number): Player {
  return {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${team.toLowerCase()}`,
    name,
    team,
    position,
    bye: 7,
    overallRank: rank,
    posRank: rank,
    tier: 1,
    adp: rank,
    projPoints: 200,
    upside: 50,
    floor: 50,
    risk: 30,
    notes: '',
    tags: [],
    rationale: 'x',
    customRank: null,
  }
}

function sPick(
  pickNumber: number,
  slot: number,
  playerName: string,
  position: string,
  team: string,
): SleeperDraftPick {
  return {
    pickNumber,
    round: Math.ceil(pickNumber / 12),
    slot,
    rosterId: String(slot),
    pickedBy: `u${slot}`,
    playerName,
    position,
    team,
  }
}

const BOARD: Player[] = [
  player("Ja'Marr Chase", 'WR', 'CIN', 1),
  player('Bijan Robinson', 'RB', 'ATL', 2),
  player('Brian Robinson Jr.', 'RB', 'WAS', 3),
  player('Broncos', 'DST', 'DEN', 4),
  player('Brandon Aubrey', 'K', 'DAL', 5),
  player('Michael Pittman Jr.', 'WR', 'IND', 6),
]

const TEAMS: LeagueTeam[] = makeSampleTeams(12, 8)

describe('normalizeName', () => {
  it('strips punctuation and generational suffixes', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarr chase')
    expect(normalizeName('JaMarr Chase')).toBe('jamarr chase')
    expect(normalizeName('Brian Robinson Jr.')).toBe('brian robinson')
    expect(normalizeName('Brian Robinson')).toBe('brian robinson')
    expect(normalizeName('Kenneth Walker III')).toBe('kenneth walker')
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amon ra st brown')
  })

  it('is safe on empty and junk input', () => {
    expect(normalizeName('')).toBe('')
    expect(normalizeName('   ')).toBe('')
  })
})

describe('matchPlayer', () => {
  it('matches on name, position and team', () => {
    const r = matchPlayer(sPick(1, 1, "Ja'Marr Chase", 'WR', 'CIN'), BOARD)
    expect(r.player?.name).toBe("Ja'Marr Chase")
    expect(r.how).toBe('exact')
  })

  it('still matches when the team is stale on one side', () => {
    const r = matchPlayer(sPick(1, 1, 'Bijan Robinson', 'RB', 'XXX'), BOARD)
    expect(r.player?.name).toBe('Bijan Robinson')
    expect(r.how).toBe('name-position')
  })

  it('matches a suffix mismatch across the two sources', () => {
    const r = matchPlayer(sPick(1, 1, 'Brian Robinson', 'RB', 'WAS'), BOARD)
    expect(r.player?.name).toBe('Brian Robinson Jr.')
  })

  it('matches defenses by team, never by name', () => {
    const r = matchPlayer(sPick(1, 1, 'Denver Broncos', 'DST', 'DEN'), BOARD)
    expect(r.player?.name).toBe('Broncos')
    expect(r.how).toBe('team-defense')

    // right mascot name, wrong team -> no match rather than a wrong match
    const wrong = matchPlayer(sPick(1, 1, 'Broncos', 'DST', 'PIT'), BOARD)
    expect(wrong.player).toBeNull()
  })

  it('never matches across positions', () => {
    const r = matchPlayer(sPick(1, 1, 'Bijan Robinson', 'WR', 'ATL'), BOARD)
    // name is unique on the board, so name-only is allowed - but position must
    // never be silently overridden when another same-name player exists
    expect(r.player?.position).toBe('RB')
    expect(r.how).toBe('name-only')
  })

  it('returns none for an unknown player', () => {
    const r = matchPlayer(sPick(1, 1, 'Nobody Atall', 'WR', 'SEA'), BOARD)
    expect(r.player).toBeNull()
    expect(r.how).toBe('none')
  })
})

describe('reconcilePicks', () => {
  it('maps picks onto the board and assigns teams by draft slot', () => {
    const res = reconcilePicks(
      [
        sPick(1, 1, "Ja'Marr Chase", 'WR', 'CIN'),
        sPick(2, 2, 'Bijan Robinson', 'RB', 'ATL'),
        sPick(3, 3, 'Denver Broncos', 'DST', 'DEN'),
      ],
      BOARD,
      TEAMS,
      DEFAULT_SETTINGS,
    )
    expect(res.matched).toBe(3)
    expect(res.unmatched).toHaveLength(0)
    expect(res.picks.map((p) => p.pickNumber)).toEqual([1, 2, 3])
    expect(res.picks[0].teamId).toBe(TEAMS.find((t) => t.slot === 1)!.id)
    expect(res.picks[2].teamId).toBe(TEAMS.find((t) => t.slot === 3)!.id)
  })

  it('reports unmatched picks instead of dropping them silently', () => {
    const res = reconcilePicks(
      [
        sPick(1, 1, "Ja'Marr Chase", 'WR', 'CIN'),
        sPick(2, 2, 'Someone Unknown', 'RB', 'SEA'),
        sPick(3, 3, 'Bijan Robinson', 'RB', 'ATL'),
      ],
      BOARD,
      TEAMS,
      DEFAULT_SETTINGS,
    )
    expect(res.matched).toBe(2)
    expect(res.total).toBe(3)
    expect(res.unmatched).toHaveLength(1)
    expect(res.unmatched[0].playerName).toBe('Someone Unknown')
  })

  it('compacts pick numbers so an unmatched pick leaves no hole', () => {
    const res = reconcilePicks(
      [
        sPick(1, 1, 'Someone Unknown', 'RB', 'SEA'),
        sPick(2, 2, "Ja'Marr Chase", 'WR', 'CIN'),
        sPick(3, 3, 'Bijan Robinson', 'RB', 'ATL'),
      ],
      BOARD,
      TEAMS,
      DEFAULT_SETTINGS,
    )
    expect(res.picks.map((p) => p.pickNumber)).toEqual([1, 2])
    expect(res.picks.map((p) => p.round)).toEqual([1, 1])
  })

  it('never drafts the same board player twice', () => {
    const res = reconcilePicks(
      [
        sPick(1, 1, "Ja'Marr Chase", 'WR', 'CIN'),
        sPick(2, 2, "Ja'Marr Chase", 'WR', 'CIN'),
      ],
      BOARD,
      TEAMS,
      DEFAULT_SETTINGS,
    )
    expect(res.matched).toBe(1)
    expect(res.unmatched).toHaveLength(1)
  })

  it('is idempotent - syncing the same feed twice gives the same board', () => {
    const feed = [
      sPick(1, 1, "Ja'Marr Chase", 'WR', 'CIN'),
      sPick(2, 2, 'Bijan Robinson', 'RB', 'ATL'),
    ]
    const a = reconcilePicks(feed, BOARD, TEAMS, DEFAULT_SETTINGS)
    const b = reconcilePicks(feed, BOARD, TEAMS, DEFAULT_SETTINGS)
    expect(a.picks).toEqual(b.picks)
  })

  it('handles an empty feed without throwing', () => {
    const res = reconcilePicks([], BOARD, TEAMS, DEFAULT_SETTINGS)
    expect(res.picks).toHaveLength(0)
    expect(res.matched).toBe(0)
  })

  it('sorts an out-of-order feed', () => {
    const res = reconcilePicks(
      [sPick(2, 2, 'Bijan Robinson', 'RB', 'ATL'), sPick(1, 1, "Ja'Marr Chase", 'WR', 'CIN')],
      BOARD,
      TEAMS,
      DEFAULT_SETTINGS,
    )
    expect(res.picks[0].playerId).toBe(BOARD[0].id)
  })
})

describe('league mapping', () => {
  it('maps Sleeper roster positions onto roster slots', () => {
    const slots = rosterSlotsFromSleeper([
      'QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DEF', 'K',
      'BN', 'BN', 'BN', 'BN', 'BN', 'BN',
    ])
    expect(slots).toEqual({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BENCH: 6 })
  })

  it('reads scoring format from Sleeper scoring settings', () => {
    expect(scoringFromSettings({ rec: 1 })).toBe('ppr')
    expect(scoringFromSettings({ rec: 0.5 })).toBe('half')
    expect(scoringFromSettings({ rec: 0 })).toBe('standard')
    expect(scoringFromSettings(undefined)).toBe('standard')
  })

  it('normalises Sleeper position names', () => {
    expect(normalizeSleeperPosition('DEF')).toBe('DST')
    expect(normalizeSleeperPosition('PK')).toBe('K')
    expect(normalizeSleeperPosition('wr')).toBe('WR')
  })

  it('reads my draft slot from the draft order and clears the manual override', () => {
    const res = importLeague(
      {
        leagueId: 'L1',
        name: 'Test League',
        teams: 12,
        scoring: 'ppr',
        rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DEF', 'K', 'BN'],
        season: '2026',
        draftId: 'D1',
      },
      {
        draftId: 'D1',
        status: 'pre_draft',
        type: 'snake',
        rounds: 15,
        teams: 12,
        draftOrder: { me: 8, other: 1 },
        reversalRound: 0,
      slotToRosterId: null,
      },
      'me',
      TEAMS,
      { me: 'David', other: 'Someone' },
    )
    expect(res.settings.mySlot).toBe(8)
    expect(res.settings.teams).toBe(12)
    expect(res.settings.scoring).toBe('ppr')
    expect(res.settings.myPickOverrides).toBeNull()
    expect(res.teams.find((t) => t.slot === 8)!.isMe).toBe(true)
    expect(res.teams.find((t) => t.slot === 1)!.name).toBe('Someone')
  })

  it('detects a third-round reversal and a non-snake draft', () => {
    const league = {
      leagueId: 'L1',
      name: 'T',
      teams: 12,
      scoring: 'ppr' as const,
      rosterPositions: ['QB', 'BN'],
      season: '2026',
      draftId: 'D1',
    }
    const rev = importLeague(
      league,
      { draftId: 'D1', status: 'pre_draft', type: 'snake', rounds: 15, teams: 12, draftOrder: null, reversalRound: 3, slotToRosterId: null },
      '',
      TEAMS,
      {},
    )
    expect(rev.settings.thirdRoundReversal).toBe(true)

    const linear = importLeague(
      league,
      { draftId: 'D1', status: 'pre_draft', type: 'linear', rounds: 15, teams: 12, draftOrder: null, reversalRound: 0, slotToRosterId: null },
      '',
      TEAMS,
      {},
    )
    expect(linear.settings.snake).toBe(false)
  })

  it('does not throw when Sleeper has no draft order yet', () => {
    const res = importLeague(
      {
        leagueId: 'L1',
        name: 'T',
        teams: 10,
        scoring: 'half',
        rosterPositions: ['QB', 'RB', 'WR', 'BN'],
        season: '2026',
        draftId: null,
      },
      null,
      '',
      TEAMS,
      {},
    )
    expect(res.teams).toHaveLength(10)
    expect(res.notes.join(' ')).toMatch(/draft order/i)
  })
})
