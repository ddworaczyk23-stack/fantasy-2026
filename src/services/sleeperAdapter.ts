import type { ScoringFormat, SleeperStatus } from '../types'

// ============================================================================
// Sleeper integration.
//
// Sleeper's read API (https://docs.sleeper.com) is PUBLIC and UNAUTHENTICATED.
// There is no API key, no OAuth flow, no token, and nothing secret is ever
// stored by this app. It is also fully CORS-open - every response carries
// `access-control-allow-origin: *` - so the browser can call it directly with
// no proxy and no backend.
//
// Two adapters ship here, behind one interface:
//
//   - `liveSleeperAdapter`  - real `fetch` calls to api.sleeper.app.
//   - `mockSleeperAdapter`  - canned data, no network. Used by tests and by
//                             anyone who wants to exercise the UI offline.
//
// Pick one with `getSleeperAdapter(kind)`. Nothing else in the app knows which
// it is talking to.
//
// LIMITS AND FAILURE MODES
// --------------------------------------------------------------------------
//   - Rate limit: Sleeper asks for under 1000 calls/minute or you risk an IP
//     block. Auto-sync here polls no faster than every 5 seconds, which is
//     ~12/minute - two orders of magnitude inside the limit.
//   - Player identity: Sleeper keys players by its own id, but each draft pick
//     carries `metadata` with first_name / last_name / position / team, so
//     picks can be matched to this app's board by name without downloading the
//     ~5MB players file. See `sleeperSync.ts` for the matching rules and how
//     unmatched picks are surfaced rather than silently dropped.
//   - Network: the draft clock does not wait for a failed request. Every sync
//     is additive and idempotent, and manual entry keeps working at all times.
//     Sync is an accelerant, not a dependency.
// ============================================================================

const API = 'https://api.sleeper.app/v1'

export interface SleeperUser {
  userId: string
  username: string
  displayName: string
}

export interface SleeperLeagueSummary {
  leagueId: string
  name: string
  season: string
  totalRosters: number
  status: string
}

export interface SleeperLeagueInfo {
  leagueId: string
  name: string
  teams: number
  scoring: ScoringFormat
  /** raw Sleeper roster slots, e.g. ['QB','RB','RB','WR','WR','TE','FLEX','DEF','K','BN',...] */
  rosterPositions: string[]
  season: string
  draftId: string | null
}

export interface SleeperDraftInfo {
  draftId: string
  /** 'pre_draft' | 'drafting' | 'complete' */
  status: string
  /** 'snake' | 'linear' | 'auction' */
  type: string
  rounds: number
  teams: number
  /** sleeper user_id -> 1-based draft slot */
  draftOrder: Record<string, number> | null
  /** 0 when the league does not use a third-round reversal */
  reversalRound: number
  /** 1-based draft slot -> sleeper roster_id, needed to read traded picks */
  slotToRosterId: Record<number, string> | null
}

/**
 * One traded draft pick, as Sleeper reports it.
 * `originalRosterId` is the team the pick STARTED with (that is what fixes its
 * place in the draft order); `ownerRosterId` is who makes the selection now.
 */
export interface SleeperTradedPick {
  season: string
  round: number
  originalRosterId: string
  ownerRosterId: string
}

export interface SleeperDraftPick {
  pickNumber: number
  round: number
  slot: number
  rosterId: string
  /** sleeper user_id of the drafter, when present */
  pickedBy: string
  playerName: string
  /** already normalised to this app's vocabulary: QB/RB/WR/TE/DST/K */
  position: string
  /** NFL team abbreviation, or '' */
  team: string
}

export interface SleeperAdapter {
  readonly kind: 'mock' | 'live'
  verifyUser(username: string): Promise<{ ok: boolean; user?: SleeperUser; message: string }>
  fetchUserLeagues(
    userId: string,
    season: string,
  ): Promise<{ ok: boolean; leagues?: SleeperLeagueSummary[]; message: string }>
  fetchLeague(
    leagueId: string,
    season: string,
  ): Promise<{ ok: boolean; league?: SleeperLeagueInfo; message: string }>
  fetchLeagueUsers(
    leagueId: string,
  ): Promise<{ ok: boolean; users?: Record<string, string>; message: string }>
  fetchDraft(draftId: string): Promise<{ ok: boolean; draft?: SleeperDraftInfo; message: string }>
  fetchDraftPicks(draftId: string): Promise<{ ok: boolean; picks?: SleeperDraftPick[]; message: string }>
  fetchTradedPicks(
    leagueId: string,
  ): Promise<{ ok: boolean; tradedPicks?: SleeperTradedPick[]; message: string }>
}

// ---------------------------------------------------------------------------
// Shared mapping helpers
// ---------------------------------------------------------------------------

/** Sleeper sends slot_to_roster_id keyed by string; roster ids come back mixed. */
export function normalizeSlotToRoster(
  raw: Record<string, number | string> | null | undefined,
): Record<number, string> | null {
  if (!raw) return null
  const out: Record<number, string> = {}
  for (const [slot, rosterId] of Object.entries(raw)) {
    const s = Number(slot)
    if (Number.isFinite(s) && s >= 1 && rosterId != null) out[s] = String(rosterId)
  }
  return Object.keys(out).length > 0 ? out : null
}

/** Sleeper writes defenses as DEF; this app calls them DST. */
export function normalizeSleeperPosition(pos: string): string {
  const p = (pos ?? '').toUpperCase().trim()
  if (p === 'DEF' || p === 'D/ST') return 'DST'
  if (p === 'PK') return 'K'
  return p
}

/**
 * Sleeper encodes scoring as numeric rules rather than a label. The reception
 * value is the one that separates the three common formats.
 */
export function scoringFromSettings(scoring: Record<string, number> | undefined): ScoringFormat {
  const rec = Number(scoring?.rec ?? 0)
  if (rec >= 0.75) return 'ppr'
  if (rec >= 0.25) return 'half'
  return 'standard'
}

async function getJson<T>(url: string, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Sleeper returned HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

function errMessage(e: unknown, what: string): string {
  if (e instanceof DOMException && e.name === 'AbortError') {
    return `${what} timed out. Check your connection - manual entry still works.`
  }
  const detail = e instanceof Error ? e.message : String(e)
  return `${what} failed: ${detail}. Manual entry still works.`
}

// ---------------------------------------------------------------------------
// Live adapter
// ---------------------------------------------------------------------------

export const liveSleeperAdapter: SleeperAdapter = {
  kind: 'live',

  async verifyUser(username) {
    const name = username.trim()
    if (!name) return { ok: false, message: 'Enter your Sleeper username.' }
    try {
      const raw = await getJson<{ user_id?: string; username?: string; display_name?: string } | null>(
        `${API}/user/${encodeURIComponent(name)}`,
      )
      if (!raw || !raw.user_id) {
        return { ok: false, message: `No Sleeper user called "${name}".` }
      }
      return {
        ok: true,
        user: {
          userId: raw.user_id,
          username: raw.username ?? name,
          displayName: raw.display_name ?? raw.username ?? name,
        },
        message: `Connected as ${raw.display_name ?? name}.`,
      }
    } catch (e) {
      return { ok: false, message: errMessage(e, 'Looking up that username') }
    }
  },

  async fetchUserLeagues(userId, season) {
    if (!userId) return { ok: false, message: 'Verify your username first.' }
    try {
      const raw = await getJson<
        { league_id: string; name: string; season: string; total_rosters: number; status: string }[] | null
      >(`${API}/user/${encodeURIComponent(userId)}/leagues/nfl/${encodeURIComponent(season)}`)
      const leagues = (raw ?? []).map((l) => ({
        leagueId: l.league_id,
        name: l.name,
        season: l.season,
        totalRosters: l.total_rosters,
        status: l.status,
      }))
      if (leagues.length === 0) {
        return { ok: true, leagues, message: `No ${season} NFL leagues found for that account.` }
      }
      return { ok: true, leagues, message: `Found ${leagues.length} league(s) for ${season}.` }
    } catch (e) {
      return { ok: false, message: errMessage(e, 'Loading your leagues') }
    }
  },

  async fetchLeague(leagueId, season) {
    const id = leagueId.trim()
    if (!id) return { ok: false, message: 'Enter your Sleeper league ID.' }
    try {
      const raw = await getJson<{
        league_id?: string
        name?: string
        season?: string
        total_rosters?: number
        draft_id?: string
        roster_positions?: string[]
        scoring_settings?: Record<string, number>
      } | null>(`${API}/league/${encodeURIComponent(id)}`)
      if (!raw || !raw.league_id) {
        return { ok: false, message: `No Sleeper league with ID "${id}".` }
      }
      return {
        ok: true,
        league: {
          leagueId: raw.league_id,
          name: raw.name ?? 'Sleeper league',
          teams: raw.total_rosters ?? 12,
          scoring: scoringFromSettings(raw.scoring_settings),
          rosterPositions: raw.roster_positions ?? [],
          season: raw.season ?? season,
          draftId: raw.draft_id ?? null,
        },
        message: `Loaded "${raw.name ?? id}".`,
      }
    } catch (e) {
      return { ok: false, message: errMessage(e, 'Loading that league') }
    }
  },

  async fetchLeagueUsers(leagueId) {
    const id = leagueId.trim()
    if (!id) return { ok: false, message: 'Enter your Sleeper league ID.' }
    try {
      const raw = await getJson<{ user_id?: string; display_name?: string; username?: string }[] | null>(
        `${API}/league/${encodeURIComponent(id)}/users`,
      )
      const users: Record<string, string> = {}
      for (const u of raw ?? []) {
        if (u.user_id) users[u.user_id] = u.display_name ?? u.username ?? u.user_id
      }
      return { ok: true, users, message: `${Object.keys(users).length} manager(s) found.` }
    } catch (e) {
      return { ok: false, message: errMessage(e, 'Loading league managers') }
    }
  },

  async fetchDraft(draftId) {
    const id = draftId.trim()
    if (!id) return { ok: false, message: 'No draft ID for this league yet.' }
    try {
      const raw = await getJson<{
        draft_id?: string
        status?: string
        type?: string
        draft_order?: Record<string, number> | null
        slot_to_roster_id?: Record<string, number | string> | null
        settings?: { rounds?: number; teams?: number; reversal_round?: number }
      } | null>(`${API}/draft/${encodeURIComponent(id)}`)
      if (!raw || !raw.draft_id) return { ok: false, message: `No Sleeper draft with ID "${id}".` }
      return {
        ok: true,
        draft: {
          draftId: raw.draft_id,
          status: raw.status ?? 'unknown',
          type: raw.type ?? 'snake',
          rounds: raw.settings?.rounds ?? 15,
          teams: raw.settings?.teams ?? 12,
          draftOrder: raw.draft_order ?? null,
          reversalRound: raw.settings?.reversal_round ?? 0,
          slotToRosterId: normalizeSlotToRoster(raw.slot_to_roster_id),
        },
        message: `Draft status: ${raw.status ?? 'unknown'}.`,
      }
    } catch (e) {
      return { ok: false, message: errMessage(e, 'Loading the draft') }
    }
  },

  async fetchDraftPicks(draftId) {
    const id = draftId.trim()
    if (!id) return { ok: false, message: 'No draft ID for this league yet.' }
    try {
      const raw = await getJson<
        {
          pick_no?: number
          round?: number
          draft_slot?: number
          roster_id?: number | string | null
          picked_by?: string | null
          player_id?: string
          metadata?: { first_name?: string; last_name?: string; position?: string; team?: string }
        }[] | null
      >(`${API}/draft/${encodeURIComponent(id)}/picks`)
      const picks: SleeperDraftPick[] = (raw ?? [])
        .filter((p) => typeof p.pick_no === 'number')
        .map((p) => {
          const first = p.metadata?.first_name ?? ''
          const last = p.metadata?.last_name ?? ''
          return {
            pickNumber: p.pick_no as number,
            round: p.round ?? 1,
            slot: p.draft_slot ?? 1,
            rosterId: String(p.roster_id ?? ''),
            pickedBy: p.picked_by ?? '',
            playerName: `${first} ${last}`.trim(),
            position: normalizeSleeperPosition(p.metadata?.position ?? ''),
            team: (p.metadata?.team ?? '').toUpperCase(),
          }
        })
        .sort((a, b) => a.pickNumber - b.pickNumber)
      return { ok: true, picks, message: `${picks.length} pick(s) made so far.` }
    } catch (e) {
      return { ok: false, message: errMessage(e, 'Loading draft picks') }
    }
  },

  async fetchTradedPicks(leagueId) {
    const id = leagueId.trim()
    if (!id) return { ok: false, message: 'Enter your Sleeper league ID.' }
    try {
      const raw = await getJson<
        {
          season?: string
          round?: number
          roster_id?: number | string | null
          owner_id?: number | string | null
        }[] | null
      >(`${API}/league/${encodeURIComponent(id)}/traded_picks`)
      const tradedPicks: SleeperTradedPick[] = (raw ?? [])
        .filter((t) => typeof t.round === 'number' && t.roster_id != null && t.owner_id != null)
        .map((t) => ({
          season: String(t.season ?? ''),
          round: t.round as number,
          originalRosterId: String(t.roster_id),
          ownerRosterId: String(t.owner_id),
        }))
      return { ok: true, tradedPicks, message: `${tradedPicks.length} traded pick(s) on record.` }
    } catch (e) {
      return { ok: false, message: errMessage(e, 'Loading traded picks') }
    }
  },
}

// ---------------------------------------------------------------------------
// Mock adapter - no network, used offline and in tests
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MOCK_DELAY_MS = 200

export const mockSleeperAdapter: SleeperAdapter = {
  kind: 'mock',

  async verifyUser(username) {
    await delay(MOCK_DELAY_MS)
    const name = username.trim()
    if (!name) return { ok: false, message: 'MOCK: enter a username (no network call is made).' }
    return {
      ok: true,
      user: { userId: `mock-user-${name.toLowerCase()}`, username: name, displayName: name },
      message: `MOCK: pretending to verify "${name}". No real Sleeper account was contacted.`,
    }
  },

  async fetchUserLeagues(_userId, season) {
    await delay(MOCK_DELAY_MS)
    return {
      ok: true,
      leagues: [
        { leagueId: 'mock-league-1', name: 'Mock Dynasty (sample)', season, totalRosters: 12, status: 'pre_draft' },
      ],
      message: 'MOCK: canned league list, not a real Sleeper account.',
    }
  },

  async fetchLeague(leagueId, season) {
    await delay(MOCK_DELAY_MS)
    if (!leagueId.trim()) return { ok: false, message: 'MOCK: enter a league id (no network call is made).' }
    return {
      ok: true,
      league: {
        leagueId,
        name: 'Mock Sleeper League (sample data)',
        teams: 12,
        scoring: 'ppr',
        rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DEF', 'K', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'],
        season,
        draftId: 'mock-draft-1',
      },
      message: 'MOCK: canned league info, not a real Sleeper league.',
    }
  },

  async fetchLeagueUsers(_leagueId) {
    await delay(MOCK_DELAY_MS)
    return { ok: true, users: { u1: 'Mock Manager One' }, message: 'MOCK: canned manager list.' }
  },

  async fetchDraft(draftId) {
    await delay(MOCK_DELAY_MS)
    return {
      ok: true,
      draft: {
        draftId,
        status: 'drafting',
        type: 'snake',
        rounds: 15,
        teams: 12,
        draftOrder: null,
        reversalRound: 0,
        slotToRosterId: null,
      },
      message: 'MOCK: canned draft info, not a real Sleeper draft.',
    }
  },

  async fetchDraftPicks(draftId) {
    await delay(MOCK_DELAY_MS)
    if (!draftId.trim()) return { ok: false, message: 'MOCK: no draft id (no network call is made).' }
    const picks: SleeperDraftPick[] = [
      { pickNumber: 1, round: 1, slot: 1, rosterId: '1', pickedBy: 'u1', playerName: "Ja'Marr Chase", position: 'WR', team: 'CIN' },
      { pickNumber: 2, round: 1, slot: 2, rosterId: '2', pickedBy: 'u2', playerName: 'Bijan Robinson', position: 'RB', team: 'ATL' },
      { pickNumber: 3, round: 1, slot: 3, rosterId: '3', pickedBy: 'u3', playerName: 'CeeDee Lamb', position: 'WR', team: 'DAL' },
    ]
    return { ok: true, picks, message: 'MOCK: canned draft picks, not a real Sleeper draft.' }
  },

  async fetchTradedPicks(_leagueId) {
    await delay(MOCK_DELAY_MS)
    return { ok: true, tradedPicks: [], message: 'MOCK: no traded picks in the canned league.' }
  },
}

export function getSleeperAdapter(kind: 'mock' | 'live'): SleeperAdapter {
  return kind === 'live' ? liveSleeperAdapter : mockSleeperAdapter
}

export function describeSleeperStatus(s: SleeperStatus): {
  label: string
  detail: string
  tone: 'neutral' | 'good' | 'warn'
} {
  switch (s) {
    case 'not-connected':
      return {
        label: 'Not connected',
        detail: 'No Sleeper account linked. Draft manually, or connect a username below.',
        tone: 'neutral',
      }
    case 'manual-mode':
      return {
        label: 'Manual mode',
        detail: 'Running on picks you enter yourself. Always reliable, never depends on the network.',
        tone: 'neutral',
      }
    case 'ready-for-import':
      return {
        label: 'Ready to import',
        detail: 'League found. Pull league settings and picks whenever you want.',
        tone: 'good',
      }
    case 'sync-available':
      return {
        label: 'Sync available',
        detail: 'Draft found. Picks can be pulled live as the draft happens.',
        tone: 'good',
      }
    default:
      return { label: 'Unknown', detail: '', tone: 'warn' }
  }
}
