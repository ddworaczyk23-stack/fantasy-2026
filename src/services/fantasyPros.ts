import { CSV_HEADERS } from './csvHeaders'

// ============================================================================
// FantasyPros cheat-sheet support.
//
// A FantasyPros CSV export does not use this app's column names, so rather
// than making anyone re-type their board, detect that shape and translate it
// into the native columns before the normal parser runs. Everything after the
// translation - validation, defaults, tier derivation - goes through exactly
// the same code path as a hand-made CSV.
//
// Typical export header:
//   "RK","TIERS","PLAYER NAME","TEAM","POS","BYE WEEK","SOS SEASON","ECR VS. ADP"
// ============================================================================

const NFL_TEAMS = new Set([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
  'HOU', 'IND', 'JAC', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO',
  'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS', 'WSH',
])

/** True when the header row looks like a FantasyPros export rather than ours. */
export function isFantasyProsHeader(header: string[]): boolean {
  const h = header.map((x) => x.trim().toLowerCase())
  const has = (name: string) => h.includes(name)
  // already our native format - leave it alone
  if (has('name') && has('position')) return false
  return (has('player name') || has('player')) && (has('pos') || has('position'))
}

/** "WR12" -> { position: 'WR', posRank: 12 }. Bare "WR" -> posRank 0. */
export function splitFantasyProsPos(raw: string): { position: string; posRank: number } {
  const v = (raw ?? '').trim().toUpperCase()
  const m = /^([A-Z/]+?)\s*(\d+)?$/.exec(v)
  if (!m) return { position: v, posRank: 0 }
  let position = m[1].replace('/', '')
  if (position === 'DEF' || position === 'DST') position = 'DST'
  if (position === 'PK') position = 'K'
  return { position, posRank: m[2] ? Number(m[2]) : 0 }
}

/**
 * Strip a trailing team token some exports append to the name, e.g.
 * "Ja'Marr Chase CIN" becomes "Ja'Marr Chase" plus team CIN.
 */
export function stripTrailingTeam(name: string): { name: string; team: string } {
  const parts = (name ?? '').trim().split(/\s+/)
  if (parts.length > 1) {
    const last = parts[parts.length - 1].toUpperCase()
    if (NFL_TEAMS.has(last)) {
      return { name: parts.slice(0, -1).join(' '), team: last }
    }
  }
  return { name: (name ?? '').trim(), team: '' }
}

interface FpRow {
  name: string
  team: string
  position: string
  posRank: number
  bye: number
  overallRank: number
  fpTier: number
  adp: number
  notes: string
}

/**
 * Translate FantasyPros rows into this app's native header + rows.
 *
 * FantasyPros tiers on the overall cheat sheet are OVERALL tiers across every
 * position, but this app's tiers are per-position. The overall tier numbers
 * are therefore renumbered within each position, in order. That keeps the tier
 * BREAKS the user cares about without pretending an overall tier 7 means the
 * same thing at RB as it does at TE.
 */
export function fantasyProsToNative(rows: string[][]): { rows: string[][]; warnings: string[] } {
  const warnings: string[] = []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const idx = (...names: string[]): number => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }

  const iRank = idx('rk', 'rank', '#')
  const iTier = idx('tiers', 'tier')
  const iName = idx('player name', 'player', 'name')
  const iTeam = idx('team', 'tm')
  const iPos = idx('pos', 'position')
  const iBye = idx('bye week', 'bye')
  const iAdp = idx('adp', 'avg', 'average')
  const iNotes = idx('notes', 'note')

  if (iAdp < 0) {
    warnings.push(
      'No ADP column in this FantasyPros file, so ADP was set equal to the ranking. ' +
        'Value-vs-ADP will read neutral until you import a file that has real ADP.',
    )
  }
  if (iTier >= 0) {
    warnings.push('FantasyPros tiers are overall tiers; they were renumbered within each position.')
  }

  const parsed: FpRow[] = []

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every((c) => (c ?? '').trim() === '')) continue

    const rawName = iName >= 0 ? (row[iName] ?? '').trim() : ''
    if (!rawName) continue
    // exports sometimes end with an attribution line
    if (/fantasypros|data provided/i.test(rawName)) continue

    const { position, posRank } = splitFantasyProsPos(iPos >= 0 ? (row[iPos] ?? '') : '')
    if (!position) continue

    const stripped = stripTrailingTeam(rawName)
    const team = (iTeam >= 0 ? (row[iTeam] ?? '').trim().toUpperCase() : '') || stripped.team

    const num = (i: number): number =>
      i >= 0 ? Number((row[i] ?? '').replace(/[^0-9.]/g, '')) || 0 : 0

    const adpRaw = num(iAdp)

    parsed.push({
      name: stripped.name || rawName,
      team: team || 'FA',
      position,
      posRank,
      bye: num(iBye),
      overallRank: num(iRank),
      fpTier: num(iTier),
      adp: adpRaw > 0 ? adpRaw : 0,
      notes: iNotes >= 0 ? (row[iNotes] ?? '').trim() : '',
    })
  }

  // fill any missing overall ranks by file order, then sort by rank
  parsed.forEach((p, i) => {
    if (!p.overallRank) p.overallRank = i + 1
  })
  parsed.sort((a, b) => a.overallRank - b.overallRank)
  for (const p of parsed) if (!p.adp) p.adp = p.overallRank

  // renumber overall FantasyPros tiers into per-position tiers
  const seenTiersByPos = new Map<string, Map<number, number>>()
  const tierFor = (p: FpRow): number => {
    if (!p.fpTier) return 0
    let map = seenTiersByPos.get(p.position)
    if (!map) {
      map = new Map()
      seenTiersByPos.set(p.position, map)
    }
    const existing = map.get(p.fpTier)
    if (existing) return existing
    const next = map.size + 1
    map.set(p.fpTier, next)
    return next
  }

  const out: string[][] = [[...CSV_HEADERS]]
  for (const p of parsed) {
    out.push([
      p.name,
      p.team,
      p.position,
      String(p.bye || ''),
      String(p.overallRank),
      String(p.posRank || ''),
      String(tierFor(p) || ''),
      String(p.adp),
      '', // projPoints - a cheat sheet has none; defaulted downstream
      '', // upside
      '', // floor
      '', // risk
      p.notes,
      '', // tags
      '', // rationale
      '', // customRank
    ])
  }

  warnings.push(`Read ${parsed.length} players from a FantasyPros export.`)
  return { rows: out, warnings }
}
