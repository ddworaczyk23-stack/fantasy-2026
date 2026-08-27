import { describe, expect, it } from 'vitest'
import { parsePlayersCsv, playersToCsv, CSV_HEADERS } from '../../services/csv'
import type { Player } from '../../types'

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'sample-id',
    name: 'Sample Player',
    team: 'CIN',
    position: 'WR',
    bye: 12,
    overallRank: 1,
    posRank: 1,
    tier: 1,
    adp: 1.2,
    projPoints: 300,
    upside: 90,
    floor: 70,
    risk: 10,
    notes: '',
    tags: ['target'],
    rationale: 'Great player.',
    customRank: null,
    ...overrides,
  }
}

describe('csv parser', () => {
  it('handles quoted fields with embedded commas', () => {
    const csv = `name,team,position\n"Smith, John",KC,WR\n`
    const result = parsePlayersCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.players).toHaveLength(1)
    expect(result.players[0].name).toBe('Smith, John')
  })

  it('handles escaped double quotes inside quoted fields', () => {
    const csv = `name,team,position,notes\n"Big ""Tank"" Johnson",KC,RB,"He's ""the guy"""\n`
    const result = parsePlayersCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.players[0].name).toBe('Big "Tank" Johnson')
    expect(result.players[0].notes).toBe('He\'s "the guy"')
  })

  it('handles CRLF line endings', () => {
    const csv = 'name,team,position\r\nAlpha,KC,WR\r\nBravo,SF,RB\r\n'
    const result = parsePlayersCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.players).toHaveLength(2)
    expect(result.players[0].name).toBe('Alpha')
    expect(result.players[1].name).toBe('Bravo')
  })

  it('produces a hard error when the name column is missing', () => {
    const csv = `team,position\nKC,WR\n`
    const result = parsePlayersCsv(csv)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.players).toEqual([])
  })

  it('produces a hard error when the position column is missing', () => {
    const csv = `name,team\nAlpha,KC\n`
    const result = parsePlayersCsv(csv)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.players).toEqual([])
  })

  it('skips a row with an invalid position and records an error', () => {
    const csv = `name,team,position\nAlpha,KC,WR\nBravo,SF,XYZ\n`
    const result = parsePlayersCsv(csv)
    expect(result.players).toHaveLength(1)
    expect(result.players[0].name).toBe('Alpha')
    expect(result.errors.some((e) => e.includes('invalid position'))).toBe(true)
  })

  it('maps DEF and D/ST to DST, and PK to K', () => {
    const csv = `name,team,position\nDefense One,BAL,DEF\nDefense Two,SF,D/ST\nKicker One,KC,PK\n`
    const result = parsePlayersCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.players[0].position).toBe('DST')
    expect(result.players[1].position).toBe('DST')
    expect(result.players[2].position).toBe('K')
  })

  it('derives posRank and tier when those columns are absent', () => {
    const csv = `name,team,position,overallRank\nRB One,KC,RB,1\nRB Two,SF,RB,2\nWR One,BAL,WR,3\n`
    const result = parsePlayersCsv(csv)
    expect(result.errors).toEqual([])
    const rbOne = result.players.find((p) => p.name === 'RB One')!
    const rbTwo = result.players.find((p) => p.name === 'RB Two')!
    const wrOne = result.players.find((p) => p.name === 'WR One')!
    expect(rbOne.posRank).toBe(1)
    expect(rbTwo.posRank).toBe(2)
    expect(wrOne.posRank).toBe(1)
    expect(rbOne.tier).toBe(1)
    expect(wrOne.tier).toBe(1)
    expect(result.warnings.some((w) => w.includes('posRank'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('tier'))).toBe(true)
  })

  it('disambiguates duplicate ids from same-name same-team rows', () => {
    const csv = `name,team,position\nJohn Smith,KC,WR\nJohn Smith,KC,WR\n`
    const result = parsePlayersCsv(csv)
    expect(result.errors).toEqual([])
    const ids = result.players.map((p) => p.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids[0]).toBe('john-smith-kc')
    expect(ids[1]).toBe('john-smith-kc-2')
  })

  it('assigns overallRank by ADP order when overallRank missing for all rows', () => {
    const csv = `name,team,position,adp\nSlow,KC,WR,5.5\nFast,SF,RB,1.2\n`
    const result = parsePlayersCsv(csv)
    const fast = result.players.find((p) => p.name === 'Fast')!
    const slow = result.players.find((p) => p.name === 'Slow')!
    expect(fast.overallRank).toBeLessThan(slow.overallRank)
    expect(result.warnings.some((w) => w.includes('overallRank'))).toBe(true)
  })

  it('has the expected header list', () => {
    expect(CSV_HEADERS).toContain('name')
    expect(CSV_HEADERS).toContain('position')
    expect(CSV_HEADERS).toContain('customRank')
  })

  it('round-trips playersToCsv -> parsePlayersCsv to equivalent players', () => {
    const players: Player[] = [
      makePlayer({ id: 'a', name: 'Alpha Player', team: 'KC', position: 'WR', overallRank: 1, posRank: 1, tier: 1 }),
      makePlayer({
        id: 'b',
        name: 'Beta, Comma Player',
        team: 'SF',
        position: 'RB',
        overallRank: 2,
        posRank: 1,
        tier: 1,
        notes: 'Has "quotes" and, commas',
        tags: ['sleeper', 'value'],
        customRank: 5,
      }),
      makePlayer({ id: 'c', name: 'Gamma Defense', team: 'BAL', position: 'DST', overallRank: 3, posRank: 1, tier: 1, customRank: null }),
    ]

    const csv = playersToCsv(players)
    const result = parsePlayersCsv(csv)

    expect(result.errors).toEqual([])
    expect(result.players).toHaveLength(players.length)

    result.players.forEach((p, i) => {
      const original = players[i]
      expect(p.name).toBe(original.name)
      expect(p.team).toBe(original.team)
      expect(p.position).toBe(original.position)
      expect(p.bye).toBe(original.bye)
      expect(p.overallRank).toBe(original.overallRank)
      expect(p.posRank).toBe(original.posRank)
      expect(p.tier).toBe(original.tier)
      expect(p.adp).toBe(original.adp)
      expect(p.projPoints).toBe(original.projPoints)
      expect(p.upside).toBe(original.upside)
      expect(p.floor).toBe(original.floor)
      expect(p.risk).toBe(original.risk)
      expect(p.notes).toBe(original.notes)
      expect(p.tags).toEqual(original.tags)
      expect(p.rationale).toBe(original.rationale)
      expect(p.customRank).toBe(original.customRank)
    })
  })
})
