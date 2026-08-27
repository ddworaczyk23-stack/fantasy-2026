import type { ScoringFormat, SleeperStatus } from '../types'

// ============================================================================
// Sleeper integration - PLACEHOLDER service layer.
//
// This file makes NO network calls, uses NO credentials or tokens, and hits
// NO hardcoded endpoints. `mockSleeperAdapter` below is the only adapter
// wired into the app right now; it returns canned data after a short delay,
// and every message it produces says plainly that the data is mock data.
//
// WHAT A LIVE ADAPTER WOULD NEED TO IMPLEMENT
// --------------------------------------------------------------------------
// Sleeper's read API (https://docs.sleeper.com) is public and unauthenticated
// - there is no API key, OAuth token, or login flow to build. A `SleeperAdapter`
// with `kind: 'live'` would need to:
//
//   1. `verifyUser(username)`  -> GET /v1/user/{username}, confirm it resolves
//      to a user_id.
//   2. `fetchLeague(leagueId, season)` -> GET /v1/league/{league_id}, map the
//      response (name, roster settings, scoring_settings, season) onto
//      `SleeperLeagueInfo`.
//   3. `fetchDraftPicks(leagueId)` -> GET /v1/league/{league_id}/drafts to find
//      the draft_id, then GET /v1/draft/{draft_id}/picks and map each pick
//      onto `SleeperDraftPick`.
//
// THE REAL BLOCKER for a browser-only (no backend) app is NOT authentication -
// it is:
//
//   - CORS: Sleeper's API is not guaranteed to send permissive CORS headers
//     for arbitrary browser origins. A production build would likely need a
//     small proxy (serverless function, edge worker, etc.) to relay these
//     GET requests, since `fetch()` straight from the deployed site may be
//     blocked by the browser even though the API itself needs no secret.
//   - ID mapping: Sleeper identifies players by its own numeric player_id
//     (from GET /v1/players/nfl, a ~5MB payload). This app's players are
//     keyed by a kebab-slug `id` derived from name+team. A live adapter needs
//     a name+team+position fuzzy-match step to reconcile the two id spaces,
//     and that match will occasionally be wrong or ambiguous (traded
//     players, defenses, name suffixes, etc.).
//
// Because of both of those, manual mode - typing/importing picks yourself via
// the CSV tools and the draft board - stays the reliable primary workflow.
// Sleeper sync is a nice-to-have accelerant, not something to depend on
// mid-draft.
//
// SWAPPING IN A LIVE ADAPTER
// --------------------------------------------------------------------------
// Everything in this app that talks to Sleeper goes through the
// `SleeperAdapter` interface below. To go live, implement a second object
// (e.g. `liveSleeperAdapter` in this same file, or a new file) that satisfies
// the interface and set `kind: 'live'`, then change the ONE call site where
// the store/UI picks an adapter (currently they should import
// `mockSleeperAdapter` from here) to import the live one instead. No other
// file needs to change.
// ============================================================================

export interface SleeperLeagueInfo {
  leagueId: string
  name: string
  teams: number
  scoring: ScoringFormat
  rosterPositions: string[]
  season: string
}

export interface SleeperDraftPick {
  pickNumber: number
  round: number
  slot: number
  rosterId: string
  playerName: string
  position: string
}

export interface SleeperAdapter {
  readonly kind: 'mock' | 'live'
  verifyUser(username: string): Promise<{ ok: boolean; userId?: string; message: string }>
  fetchLeague(leagueId: string, season: string): Promise<{ ok: boolean; league?: SleeperLeagueInfo; message: string }>
  fetchDraftPicks(leagueId: string): Promise<{ ok: boolean; picks?: SleeperDraftPick[]; message: string }>
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MOCK_DELAY_MS = 300

export const mockSleeperAdapter: SleeperAdapter = {
  kind: 'mock',

  async verifyUser(username: string) {
    await delay(MOCK_DELAY_MS)
    if (!username.trim()) {
      return { ok: false, message: 'MOCK DATA: enter a username to "verify" (no network call is made).' }
    }
    return {
      ok: true,
      userId: `mock-user-${username.trim().toLowerCase()}`,
      message: `MOCK DATA: pretending to verify Sleeper user "${username}". No real Sleeper account was contacted.`,
    }
  },

  async fetchLeague(leagueId: string, season: string) {
    await delay(MOCK_DELAY_MS)
    if (!leagueId.trim()) {
      return { ok: false, message: 'MOCK DATA: enter a league id (no network call is made).' }
    }
    return {
      ok: true,
      league: {
        leagueId,
        name: 'Mock Sleeper League (sample data)',
        teams: 12,
        scoring: 'ppr',
        rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'],
        season,
      },
      message: 'MOCK DATA: this league info is canned sample data, not a real Sleeper league.',
    }
  },

  async fetchDraftPicks(leagueId: string) {
    await delay(MOCK_DELAY_MS)
    if (!leagueId.trim()) {
      return { ok: false, message: 'MOCK DATA: enter a league id (no network call is made).' }
    }
    const picks: SleeperDraftPick[] = [
      { pickNumber: 1, round: 1, slot: 1, rosterId: 'mock-roster-1', playerName: "Ja'Marr Chase", position: 'WR' },
      { pickNumber: 2, round: 1, slot: 2, rosterId: 'mock-roster-2', playerName: 'Bijan Robinson', position: 'RB' },
      { pickNumber: 3, round: 1, slot: 3, rosterId: 'mock-roster-3', playerName: 'CeeDee Lamb', position: 'WR' },
    ]
    return {
      ok: true,
      picks,
      message: 'MOCK DATA: these draft picks are canned samples, not a real Sleeper draft.',
    }
  },
}

export function describeSleeperStatus(s: SleeperStatus): { label: string; detail: string; tone: 'neutral' | 'good' | 'warn' } {
  switch (s) {
    case 'not-connected':
      return {
        label: 'Not connected',
        detail: 'No Sleeper account linked. Draft manually or connect a username below.',
        tone: 'neutral',
      }
    case 'manual-mode':
      return {
        label: 'Manual mode',
        detail: 'Running on manual picks. This is the reliable primary workflow - Sleeper sync is optional.',
        tone: 'neutral',
      }
    case 'ready-for-import':
      return {
        label: 'Ready to import',
        detail: 'League found. Picks can be pulled in, but nothing syncs automatically yet.',
        tone: 'good',
      }
    case 'sync-available':
      return {
        label: 'Sync available',
        detail: 'Live sync is available for this league. Picks can be pulled as the draft happens.',
        tone: 'good',
      }
    default:
      return { label: 'Unknown', detail: '', tone: 'warn' }
  }
}
