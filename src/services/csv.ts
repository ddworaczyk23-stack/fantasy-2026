import type { CsvImportResult, Player, PlayerTag, Position } from '../types'
import { POSITIONS } from '../types'

// ============================================================================
// CSV service: template/export/import for the player board.
// A small hand-rolled RFC-4180-ish parser (no dependency): handles quoted
// fields, embedded commas, embedded "" escaped quotes, and CRLF/LF endings.
// ============================================================================

export const CSV_HEADERS: string[] = [
  'name',
  'team',
  'position',
  'bye',
  'overallRank',
  'posRank',
  'tier',
  'adp',
  'projPoints',
  'upside',
  'floor',
  'risk',
  'notes',
  'tags',
  'rationale',
  'customRank',
]

const KNOWN_TAGS: PlayerTag[] = [
  'target',
  'fade',
  'avoid-at-cost',
  'sleeper',
  'injury-concern',
  'value',
  'handcuff',
  'pass-catcher',
  'high-target',
]

const POSITION_ALIASES: Record<string, Position> = {
  DEF: 'DST',
  'D/ST': 'DST',
  DST: 'DST',
  PK: 'K',
  K: 'K',
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
}

const TIER_CHUNK: Record<Position, number> = {
  QB: 4,
  RB: 6,
  WR: 6,
  TE: 4,
  DST: 8,
  K: 8,
}

// ---------------------------------------------------------------------------
// Low-level CSV tokenizer
// ---------------------------------------------------------------------------

/** Parse raw CSV text into rows of string cells. Handles quotes, escaped
 * quotes, embedded commas/newlines inside quotes, and CRLF/LF. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const len = text.length

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  while (i < len) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      pushField()
      i++
      continue
    }
    if (ch === '\r') {
      // handle CRLF and lone CR
      if (text[i + 1] === '\n') i++
      pushRow()
      i++
      continue
    }
    if (ch === '\n') {
      pushRow()
      i++
      continue
    }
    field += ch
    i++
  }

  // trailing field/row (skip if file ended cleanly on a newline and buffer is empty)
  if (field.length > 0 || row.length > 0) {
    pushRow()
  }

  // drop fully-empty trailing rows (e.g. from a trailing blank line)
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

function csvEscapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function rowToCsvLine(cells: (string | number)[]): string {
  return cells.map((c) => csvEscapeField(String(c))).join(',')
}

// ---------------------------------------------------------------------------
// Template / export
// ---------------------------------------------------------------------------

export function csvTemplate(): string {
  const example = rowToCsvLine([
    "Ja'Marr Chase",
    'CIN',
    'WR',
    12,
    1,
    1,
    1,
    1.2,
    340.5,
    95,
    80,
    15,
    '',
    'target|value',
    'Elite target share on a top offense.',
    '',
  ])
  return `${CSV_HEADERS.join(',')}\r\n${example}\r\n`
}

export function playersToCsv(players: Player[]): string {
  const lines = [CSV_HEADERS.join(',')]
  for (const p of players) {
    lines.push(
      rowToCsvLine([
        p.name,
        p.team,
        p.position,
        p.bye,
        p.overallRank,
        p.posRank,
        p.tier,
        p.adp,
        p.projPoints,
        p.upside,
        p.floor,
        p.risk,
        p.notes,
        p.tags.join('|'),
        p.rationale,
        p.customRank === null ? '' : p.customRank,
      ]),
    )
  }
  return lines.join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toNumber(raw: string | undefined, fallback: number, rowNum: number, col: string, warnings: string[]): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    warnings.push(`Row ${rowNum}: column "${col}" value "${raw}" is not numeric, using default ${fallback}.`)
    return fallback
  }
  return n
}

function toNullableNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return n
}

export function parsePlayersCsv(text: string): CsvImportResult {
  const errors: string[] = []
  const warnings: string[] = []

  const rows = parseCsvRows(text)
  if (rows.length === 0) {
    return { players: [], rowCount: 0, errors: ['CSV is empty.'], warnings }
  }

  const headerRow = rows[0].map((h) => h.trim().toLowerCase())
  const colIndex: Record<string, number> = {}
  for (let i = 0; i < headerRow.length; i++) {
    colIndex[headerRow[i]] = i
  }

  const knownLower = new Set(CSV_HEADERS.map((h) => h.toLowerCase()))
  for (const h of headerRow) {
    if (h && !knownLower.has(h)) {
      warnings.push(`Unknown column "${h}" ignored.`)
    }
  }

  if (!('name' in colIndex)) {
    errors.push('Missing required "name" column.')
  }
  if (!('position' in colIndex)) {
    errors.push('Missing required "position" column.')
  }
  if (errors.length > 0) {
    return { players: [], rowCount: rows.length - 1, errors, warnings }
  }

  const dataRows = rows.slice(1)
  const rowCount = dataRows.length

  const get = (r: string[], key: string): string | undefined => {
    const idx = colIndex[key]
    if (idx === undefined) return undefined
    return r[idx]
  }

  type WorkingPlayer = Player & { _adpMissing: boolean; _overallRankMissing: boolean; _posRankMissing: boolean; _tierMissing: boolean }

  const usedIds = new Map<string, number>()
  const working: WorkingPlayer[] = []

  for (let r = 0; r < dataRows.length; r++) {
    const rowNum = r + 2 // 1-based, +1 for header row
    const row = dataRows[r]

    const name = (get(row, 'name') ?? '').trim()
    if (!name) {
      errors.push(`Row ${rowNum}: missing name, row skipped.`)
      continue
    }

    const posRaw = (get(row, 'position') ?? '').trim().toUpperCase()
    const position = POSITION_ALIASES[posRaw]
    if (!position || !POSITIONS.includes(position)) {
      errors.push(`Row ${rowNum}: invalid position "${posRaw}", row skipped.`)
      continue
    }

    const team = (get(row, 'team') ?? 'FA').trim() || 'FA'

    let id = `${slugify(name)}-${team.toLowerCase()}`
    if (usedIds.has(id)) {
      const n = usedIds.get(id)! + 1
      usedIds.set(id, n)
      id = `${id}-${n}`
    } else {
      usedIds.set(id, 1)
    }

    const bye = toNumber(get(row, 'bye'), 0, rowNum, 'bye', warnings)
    const overallRankRaw = get(row, 'overallrank')
    const overallRank = toNumber(overallRankRaw, 0, rowNum, 'overallRank', warnings)
    const posRankRaw = get(row, 'posrank')
    const posRank = toNumber(posRankRaw, 0, rowNum, 'posRank', warnings)
    const tierRaw = get(row, 'tier')
    const tier = toNumber(tierRaw, 0, rowNum, 'tier', warnings)
    const adp = toNumber(get(row, 'adp'), 0, rowNum, 'adp', warnings)
    const projPoints = toNumber(get(row, 'projpoints'), 0, rowNum, 'projPoints', warnings)
    const upside = toNumber(get(row, 'upside'), 0, rowNum, 'upside', warnings)
    const floor = toNumber(get(row, 'floor'), 0, rowNum, 'floor', warnings)
    const risk = toNumber(get(row, 'risk'), 0, rowNum, 'risk', warnings)
    const notes = (get(row, 'notes') ?? '').trim()
    const rationale = (get(row, 'rationale') ?? '').trim()
    const customRank = toNullableNumber(get(row, 'customrank'))

    const tagsRaw = (get(row, 'tags') ?? '').trim()
    const tags: PlayerTag[] = []
    if (tagsRaw) {
      for (const t of tagsRaw.split('|')) {
        const trimmed = t.trim() as PlayerTag
        if (!trimmed) continue
        if (KNOWN_TAGS.includes(trimmed)) {
          tags.push(trimmed)
        } else {
          warnings.push(`Row ${rowNum}: unknown tag "${trimmed}" dropped.`)
        }
      }
    }

    working.push({
      id,
      name,
      team,
      position,
      bye,
      overallRank,
      posRank,
      tier,
      adp,
      projPoints,
      upside,
      floor,
      risk,
      notes,
      tags,
      rationale,
      customRank,
      _adpMissing: adp === 0 && (get(row, 'adp') ?? '').trim() === '',
      _overallRankMissing: (overallRankRaw ?? '').trim() === '',
      _posRankMissing: (posRankRaw ?? '').trim() === '',
      _tierMissing: (tierRaw ?? '').trim() === '',
    })
  }

  // Derive overallRank by ADP order (or file order) when missing for ALL rows.
  const allOverallRankMissing = working.length > 0 && working.every((p) => p._overallRankMissing)
  if (allOverallRankMissing) {
    const allAdpMissing = working.every((p) => p._adpMissing)
    const ordered = [...working]
    if (!allAdpMissing) {
      ordered.sort((a, b) => (a.adp || Infinity) - (b.adp || Infinity))
    }
    ordered.forEach((p, idx) => {
      p.overallRank = idx + 1
    })
    warnings.push(
      allAdpMissing
        ? 'overallRank was missing for all rows; assigned by file order.'
        : 'overallRank was missing for all rows; assigned by ADP order.',
    )
  }

  // Derive posRank when missing, grouped by position, ordered by overallRank.
  const needsPosRank = working.some((p) => p._posRankMissing)
  if (needsPosRank) {
    const byPos = new Map<Position, WorkingPlayer[]>()
    for (const p of working) {
      if (!byPos.has(p.position)) byPos.set(p.position, [])
      byPos.get(p.position)!.push(p)
    }
    for (const [, list] of byPos) {
      list.sort((a, b) => a.overallRank - b.overallRank)
      list.forEach((p, idx) => {
        if (p._posRankMissing) p.posRank = idx + 1
      })
    }
    warnings.push('posRank was missing for some rows; derived from overallRank order within position.')
  }

  // Derive tier when missing, chunking each position's posRank-ordered list.
  const needsTier = working.some((p) => p._tierMissing)
  if (needsTier) {
    const byPos = new Map<Position, WorkingPlayer[]>()
    for (const p of working) {
      if (!byPos.has(p.position)) byPos.set(p.position, [])
      byPos.get(p.position)!.push(p)
    }
    for (const [pos, list] of byPos) {
      list.sort((a, b) => a.posRank - b.posRank)
      const chunk = TIER_CHUNK[pos]
      list.forEach((p, idx) => {
        if (p._tierMissing) p.tier = Math.floor(idx / chunk) + 1
      })
    }
    warnings.push('tier was missing for some rows; derived by chunking positions into tiers.')
  }

  const players: Player[] = working.map((p) => {
    const { _adpMissing, _overallRankMissing, _posRankMissing, _tierMissing, ...rest } = p
    return rest
  })

  return { players, rowCount, errors, warnings }
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

export function downloadText(filename: string, text: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return
  }
  try {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  } catch {
    // ignore - non-browser or blocked environment
  }
}
