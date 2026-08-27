// ============================================================================
// Draft Day Command Center - shared type contract.
// EVERY module in this app codes against these types. Do not change a type
// here without updating engine, store, and views together.
// ============================================================================

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'DST' | 'K'

export const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'DST', 'K']
export const SKILL_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE']
export const FLEX_POSITIONS: Position[] = ['RB', 'WR', 'TE']

export type PlayerTag =
  | 'target'
  | 'fade'
  | 'avoid-at-cost'
  | 'sleeper'
  | 'injury-concern'
  | 'value'
  | 'handcuff'
  | 'pass-catcher'
  | 'high-target'

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface Player {
  /** stable slug id, e.g. "ja-marr-chase-cin" */
  id: string
  name: string
  /** NFL team abbreviation, or "FA" */
  team: string
  position: Position
  /** bye week 1-18, or 0 when unknown */
  bye: number
  /** consensus overall rank, 1 = best */
  overallRank: number
  /** rank within position, 1 = best */
  posRank: number
  /** tier within position, 1 = best tier */
  tier: number
  /** Sleeper ADP as an overall pick number (e.g. 4.2) */
  adp: number
  /** projected full-season PPR points */
  projPoints: number
  /** 0-100 ceiling score */
  upside: number
  /** 0-100 floor / weekly-safety score */
  floor: number
  /** 0-100 risk score, higher = riskier */
  risk: number
  /** injury or role concern note, may be '' */
  notes: string
  tags: PlayerTag[]
  /** one or two sentence analyst-style rationale */
  rationale: string
  /** user override of overall rank; null = use overallRank */
  customRank: number | null
}

// ---------------------------------------------------------------------------
// League + draft state
// ---------------------------------------------------------------------------

export interface LeagueTeam {
  id: string
  name: string
  /** 1-based draft slot */
  slot: number
  isMe: boolean
}

export interface DraftPick {
  /** 1-based overall pick number */
  pickNumber: number
  round: number
  /** 1-based slot that made the pick */
  slot: number
  teamId: string
  playerId: string
  timestamp: number
}

export interface RosterSlots {
  QB: number
  RB: number
  WR: number
  TE: number
  FLEX: number
  DST: number
  K: number
  BENCH: number
}

export type ScoringFormat = 'ppr' | 'half' | 'standard'

export interface LeagueSettings {
  teams: number
  scoring: ScoringFormat
  superflex: boolean
  rounds: number
  snake: boolean
  /** third-round reversal (some leagues run it) */
  thirdRoundReversal: boolean
  /** my 1-based draft slot */
  mySlot: number
  roster: RosterSlots
  /**
   * Explicit list of overall pick numbers that belong to me. When non-null this
   * WINS over slot/snake math. Lets a user whose real board is 1.08 / 2.08 /
   * 3.09 / 9th-thereafter type the truth instead of fighting snake math.
   */
  myPickOverrides: number[] | null
  /** do not recommend DST/K until this many rounds remain. default 2 */
  kdstLastRounds: number
  /** when true, engine may recommend DST/K at any time */
  allowEarlyKDst: boolean
}

export type SleeperStatus =
  | 'not-connected'
  | 'manual-mode'
  | 'ready-for-import'
  | 'sync-available'

export interface SleeperConfig {
  username: string
  leagueId: string
  season: string
  status: SleeperStatus
  lastSyncAt: number | null
  lastError: string | null
  /** resolved Sleeper user_id, set once a username verifies */
  userId: string
  /** resolved draft_id for the league, set once the league loads */
  draftId: string
  /** 'live' hits api.sleeper.app; 'mock' returns canned data offline */
  adapter: 'live' | 'mock'
  /** poll the draft automatically while it is running */
  autoSync: boolean
  /** seconds between auto-sync polls; Sleeper asks for <1000 calls/min */
  pollSeconds: number
  /** picks Sleeper reported that could not be matched to a board player */
  unmatched: { pickNumber: number; playerName: string; position: string; team: string }[]
}

// ---------------------------------------------------------------------------
// Decision engine
// ---------------------------------------------------------------------------

export interface Weights {
  /** expert / consensus rank. default 0.35 */
  consensus: number
  /** projected PPR opportunity + role stability. default 0.20 */
  opportunity: number
  /** positional scarcity + tier-drop risk. default 0.15 */
  scarcity: number
  /** value versus Sleeper ADP. default 0.15 */
  adpValue: number
  /** roster-construction fit. default 0.10 */
  fit: number
  /** upside / contingent value. default 0.05 */
  upside: number
}

export interface ScoreBreakdown {
  consensus: number
  opportunity: number
  scarcity: number
  adpValue: number
  fit: number
  upside: number
  /** negative number applied after the weighted sum */
  riskPenalty: number
  /** positional-run / opponent-need bump */
  runAdjustment: number
}

export type Confidence = 'high' | 'medium' | 'low'

export interface ScoredPlayer {
  player: Player
  /** 0-100 composite Draft Score */
  score: number
  breakdown: ScoreBreakdown
  /**
   * `player.adp - currentPick`.
   * NEGATIVE = the player has fallen PAST his ADP, so taking him now is value.
   * POSITIVE = the market expects him later than now, so taking him now is a reach.
   */
  valueVsAdp: number
  /** 0-100 roster fit */
  fitScore: number
  confidence: Confidence
  /** human readable risk flags, e.g. "Coming off ACL" */
  riskFlags: string[]
  /** bullet reasons that justify the score */
  reasons: string[]
  /** 'floor' = safe, 'upside' = ceiling swing, 'balanced' */
  profile: 'floor' | 'upside' | 'balanced'
}

export type WaitVerdict =
  | 'take-now'
  | 'likely-gone'
  | 'possible-value-next-round'
  | 'safe-to-wait'

export interface WaitAnalysis {
  playerId: string
  playerName: string
  position: Position
  verdict: WaitVerdict
  /** 0-1 probability the player survives to my next pick */
  survivalProbability: number
  picksUntilNext: number
  explanation: string
}

export interface TierState {
  position: Position
  tier: number
  remaining: number
  players: Player[]
  /** true when this tier is nearly exhausted */
  cliff: boolean
}

export interface TierAlert {
  position: Position
  tier: number
  remaining: number
  severity: 'info' | 'warn' | 'critical'
  message: string
}

export type BuildStyle =
  | 'Empty'
  | 'Balanced'
  | 'WR-first balanced'
  | 'Hero RB'
  | 'Zero-RB leaning'
  | 'RB-heavy'
  | 'Fragile at RB'
  | 'Fragile at WR'

export interface StarterSlot {
  /** display key, e.g. "RB1", "FLEX" */
  key: string
  position: Position | 'FLEX'
  player: Player | null
}

export interface ByeConflict {
  week: number
  players: Player[]
}

export interface RosterAnalysis {
  teamId: string
  counts: Record<Position, number>
  starters: StarterSlot[]
  bench: Player[]
  /** unfilled starter needs, highest priority first */
  needs: Position[]
  buildStyle: BuildStyle
  byeConflicts: ByeConflict[]
  priorities: { next1: Position[]; next2: Position[]; next3: Position[] }
  focus: 'floor' | 'upside' | 'need' | 'value'
  strengths: string[]
  vulnerabilities: string[]
  /** projected starting-lineup points */
  starterPoints: number
}

export interface TeamNeed {
  teamId: string
  teamName: string
  slot: number
  counts: Record<Position, number>
  /** priority-ordered unmet starter needs */
  needs: Position[]
}

export interface PositionalRun {
  position: Position
  /** picks of this position inside the window */
  countInWindow: number
  window: number
  active: boolean
}

export interface DraftRoomRead {
  teamNeeds: TeamNeed[]
  runs: PositionalRun[]
  /** teams picking between my current pick and my next pick */
  teamsBeforeNextPick: TeamNeed[]
  /** expected number of each position taken before my next pick */
  positionsLikelyGone: { position: Position; expected: number }[]
  /** plain-english bullets for the Draft Room Read panel */
  summary: string[]
}

export interface Caution {
  playerId: string
  playerName: string
  severity: 'info' | 'warn' | 'critical'
  message: string
  /** e.g. "Realistic range: picks 34-48" */
  realisticRange: string
}

export interface Recommendation {
  onTheClock: boolean
  currentPick: number
  round: number
  myNextPick: number | null
  picksUntilNext: number
  primary: ScoredPlayer | null
  alternatives: ScoredPlayer[]
  waitAnalysis: WaitAnalysis[]
  tierAlerts: TierAlert[]
  roster: RosterAnalysis
  roomRead: DraftRoomRead
  cautions: Caution[]
  /** long-form auditable paragraph for the Strategy Explanation panel */
  strategyExplanation: string
}

/** Everything the pure engine needs. No React, no storage, no globals. */
export interface EngineContext {
  players: Player[]
  picks: DraftPick[]
  teams: LeagueTeam[]
  settings: LeagueSettings
  weights: Weights
  /** overall pick number currently on the clock (1-based) */
  currentPick: number
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface SavedState {
  version: number
  savedAt: number
  players: Player[]
  picks: DraftPick[]
  teams: LeagueTeam[]
  settings: LeagueSettings
  weights: Weights
  sleeper: SleeperConfig
}

export interface CsvImportResult {
  players: Player[]
  rowCount: number
  errors: string[]
  warnings: string[]
}
