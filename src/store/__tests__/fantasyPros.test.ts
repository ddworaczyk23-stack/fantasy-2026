import { describe, it, expect } from 'vitest'
import { parsePlayersCsv } from '../../services/csv'
import { isFantasyProsHeader, splitFantasyProsPos, stripTrailingTeam } from '../../services/fantasyPros'

// A realistic FantasyPros draft cheat-sheet export: quoted fields, a combined
// position+rank column, overall tiers, and an attribution line at the bottom.
const FP_CSV = [
  '"RK","TIERS","PLAYER NAME","TEAM","POS","BYE WEEK","SOS SEASON","ECR VS. ADP"',
  '"1","1","Ja\'Marr Chase","CIN","WR1","10","3 out of 5 stars","0"',
  '"2","1","Bijan Robinson","ATL","RB1","5","4 out of 5 stars","-1"',
  '"3","1","Justin Jefferson","MIN","WR2","6","3 out of 5 stars","1"',
  '"4","2","Saquon Barkley","PHI","RB2","9","2 out of 5 stars","2"',
  '"5","2","Malik Nabers","NYG","WR3","14","4 out of 5 stars","-2"',
  '"6","3","Brock Bowers","LV","TE1","10","3 out of 5 stars","0"',
  '"7","4","Josh Allen","BUF","QB1","7","3 out of 5 stars","5"',
  '"8","5","Trey McBride","ARI","TE2","8","3 out of 5 stars","1"',
  '"9","6","Broncos","DEN","DST1","12","3 out of 5 stars","0"',
  '"10","6","Brandon Aubrey","DAL","K1","10","3 out of 5 stars","0"',
  '"","","Data provided by FantasyPros","","","","",""',
  '',
].join('\r\n')

describe('FantasyPros detection', () => {
  it('recognises a FantasyPros header', () => {
    expect(isFantasyProsHeader(['RK', 'TIERS', 'PLAYER NAME', 'TEAM', 'POS', 'BYE WEEK'])).toBe(true)
    expect(isFantasyProsHeader(['Rank', 'Player', 'Team', 'Bye', 'POS', 'AVG'])).toBe(true)
  })

  it('leaves the app native format alone', () => {
    expect(isFantasyProsHeader(['name', 'team', 'position', 'bye', 'overallRank'])).toBe(false)
  })

  it('splits a combined position and positional rank', () => {
    expect(splitFantasyProsPos('WR12')).toEqual({ position: 'WR', posRank: 12 })
    expect(splitFantasyProsPos('QB1')).toEqual({ position: 'QB', posRank: 1 })
    expect(splitFantasyProsPos('DST1')).toEqual({ position: 'DST', posRank: 1 })
    expect(splitFantasyProsPos('DEF2')).toEqual({ position: 'DST', posRank: 2 })
    expect(splitFantasyProsPos('K')).toEqual({ position: 'K', posRank: 0 })
  })

  it('strips a team appended to the name', () => {
    expect(stripTrailingTeam("Ja'Marr Chase CIN")).toEqual({ name: "Ja'Marr Chase", team: 'CIN' })
    expect(stripTrailingTeam('Bijan Robinson')).toEqual({ name: 'Bijan Robinson', team: '' })
  })
})

describe('importing a FantasyPros cheat sheet', () => {
  const result = parsePlayersCsv(FP_CSV)

  it('imports every real row and no errors', () => {
    expect(result.errors).toEqual([])
    expect(result.players).toHaveLength(10)
  })

  it('drops the attribution line rather than importing it as a player', () => {
    expect(result.players.some((p) => /fantasypros/i.test(p.name))).toBe(false)
  })

  it('reads name, team, position, positional rank and bye', () => {
    const chase = result.players.find((p) => p.name === "Ja'Marr Chase")!
    expect(chase.team).toBe('CIN')
    expect(chase.position).toBe('WR')
    expect(chase.posRank).toBe(1)
    expect(chase.bye).toBe(10)
    expect(chase.overallRank).toBe(1)
  })

  it('maps DST and K correctly', () => {
    const dst = result.players.find((p) => p.position === 'DST')!
    expect(dst.name).toBe('Broncos')
    expect(dst.team).toBe('DEN')
    const k = result.players.find((p) => p.position === 'K')!
    expect(k.name).toBe('Brandon Aubrey')
  })

  it('renumbers overall tiers into per-position tiers', () => {
    // FantasyPros overall tiers 1,1,1,2,2 across WR/RB become per-position 1,2
    const wrs = result.players.filter((p) => p.position === 'WR').sort((a, b) => a.overallRank - b.overallRank)
    expect(wrs.map((p) => p.tier)).toEqual([1, 1, 2])
    const tes = result.players.filter((p) => p.position === 'TE').sort((a, b) => a.overallRank - b.overallRank)
    expect(tes.map((p) => p.tier)).toEqual([1, 2])
  })

  it('warns clearly that ADP was derived when the file has none', () => {
    expect(result.warnings.join(' ')).toMatch(/No ADP column/i)
    const chase = result.players.find((p) => p.name === "Ja'Marr Chase")!
    expect(chase.adp).toBe(chase.overallRank)
  })

  it('says how many players it read', () => {
    expect(result.warnings.join(' ')).toMatch(/Read 10 players from a FantasyPros export/)
  })

  it('produces players the engine can use without NaN fields', () => {
    for (const p of result.players) {
      expect(Number.isFinite(p.overallRank)).toBe(true)
      expect(Number.isFinite(p.adp)).toBe(true)
      expect(Number.isFinite(p.projPoints)).toBe(true)
      expect(Number.isFinite(p.tier)).toBe(true)
      expect(p.id).toBeTruthy()
    }
  })

  it('uses a real ADP column when the file has one', () => {
    const withAdp = [
      'Rank,Player,Team,Bye,POS,AVG',
      '1,Bijan Robinson,ATL,5,RB1,1.4',
      '2,Ja\'Marr Chase,CIN,10,WR1,2.8',
    ].join('\n')
    const res = parsePlayersCsv(withAdp)
    expect(res.errors).toEqual([])
    const bijan = res.players.find((p) => p.name === 'Bijan Robinson')!
    expect(bijan.adp).toBeCloseTo(1.4, 5)
    expect(res.warnings.join(' ')).not.toMatch(/No ADP column/i)
  })
})
