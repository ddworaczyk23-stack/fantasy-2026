import { useMemo } from 'react'
import { create } from 'zustand'
import type {
  DraftPick,
  EngineContext,
  LeagueSettings,
  LeagueTeam,
  Player,
  PlayerTag,
  Recommendation,
  SavedState,
  SleeperConfig,
  Weights,
} from '../types'
import { DEFAULT_SETTINGS, DEFAULT_SLEEPER, DEFAULT_WEIGHTS, STATE_VERSION } from '../engine/defaults'
import { currentPickNumber, roundForPick, slotForPick, teamForPick } from '../engine/picks'
import { recommend } from '../engine'
import { makeSamplePlayers } from '../data/samplePlayers'
import { makeFantasyProsPlayers } from '../data/fantasyProsBoard'
import { makeSampleDraft, makeSampleTeams } from '../data/sampleLeague'
import { clearState, loadState, saveState } from '../services/persistence'
import { getSleeperAdapter, type SleeperLeagueSummary } from '../services/sleeperAdapter'
import { importLeague, reconcilePicks } from '../services/sleeperSync'

export interface SleeperActionResult {
  ok: boolean
  message: string
  notes?: string[]
}

export interface DraftStore {
  players: Player[]
  picks: DraftPick[]
  teams: LeagueTeam[]
  settings: LeagueSettings
  weights: Weights
  sleeper: SleeperConfig
  hydrated: boolean

  hydrate(): void
  draftPlayer(playerId: string, teamId?: string): void
  undoLastPick(): void
  resetDraft(): void
  loadSampleDraft(throughPick: number): void
  resetAll(): void

  setPlayers(players: Player[]): void
  updatePlayer(id: string, patch: Partial<Player>): void
  togglePlayerTag(id: string, tag: PlayerTag): void

  setSettings(patch: Partial<LeagueSettings>): void
  setWeights(patch: Partial<Weights>): void
  setTeams(teams: LeagueTeam[]): void
  renameTeam(id: string, name: string): void
  setSleeper(patch: Partial<SleeperConfig>): void

  /** Verify the Sleeper username and resolve a user_id. */
  sleeperConnect(): Promise<SleeperActionResult>
  /** List the connected account's leagues for the configured season. */
  sleeperListLeagues(): Promise<SleeperActionResult & { leagues?: SleeperLeagueSummary[] }>
  /** Pull league settings, roster slots, manager names and draft order. */
  sleeperImportLeague(): Promise<SleeperActionResult>
  /** Pull the current draft picks and apply them to the board. */
  sleeperSyncPicks(): Promise<SleeperActionResult>

  exportJson(): string
  importJson(json: string): { ok: boolean; error?: string }
}

function initialState() {
  return {
    players: makeFantasyProsPlayers(DEFAULT_SETTINGS),
    teams: makeSampleTeams(DEFAULT_SETTINGS.teams, DEFAULT_SETTINGS.mySlot),
    picks: [] as DraftPick[],
    settings: { ...DEFAULT_SETTINGS },
    weights: { ...DEFAULT_WEIGHTS },
    sleeper: { ...DEFAULT_SLEEPER },
    hydrated: false,
  }
}

/** Rebuild teams for a new (teams, mySlot) pair, preserving any name the
 * user actually typed for a surviving slot. A name is treated as
 * user-customized when it differs from what makeSampleTeams would have
 * generated for that slot under the PREVIOUS settings (so untouched default
 * names don't get "preserved" onto a now-mismatched slot). */
function rebuildTeams(prevTeams: LeagueTeam[], prevSettings: LeagueSettings, teams: number, mySlot: number): LeagueTeam[] {
  const prevDefaults = makeSampleTeams(prevSettings.teams, prevSettings.mySlot)
  const prevDefaultBySlot = new Map(prevDefaults.map((t: LeagueTeam) => [t.slot, t.name]))
  const customNameBySlot = new Map<number, string>()
  for (const t of prevTeams) {
    const defaultName = prevDefaultBySlot.get(t.slot)
    if (defaultName !== undefined && t.name !== defaultName) {
      customNameBySlot.set(t.slot, t.name)
    }
  }

  const fresh = makeSampleTeams(teams, mySlot)
  return fresh.map((t: LeagueTeam) => {
    const custom = customNameBySlot.get(t.slot)
    return custom !== undefined ? { ...t, name: custom } : t
  })
}

function toSavedState(s: {
  players: Player[]
  picks: DraftPick[]
  teams: LeagueTeam[]
  settings: LeagueSettings
  weights: Weights
  sleeper: SleeperConfig
}): SavedState {
  return {
    version: STATE_VERSION,
    savedAt: Date.now(),
    players: s.players,
    picks: s.picks,
    teams: s.teams,
    settings: s.settings,
    weights: s.weights,
    sleeper: s.sleeper,
  }
}

export const useDraftStore = create<DraftStore>()((set, get) => ({
  ...initialState(),

  hydrate() {
    const saved = loadState()
    if (saved) {
      set({
        players: Array.isArray(saved.players) && saved.players.length > 0 ? saved.players : makeFantasyProsPlayers(DEFAULT_SETTINGS),
        picks: Array.isArray(saved.picks) ? saved.picks : [],
        teams: Array.isArray(saved.teams) && saved.teams.length > 0 ? saved.teams : get().teams,
        settings: { ...DEFAULT_SETTINGS, ...saved.settings },
        weights: { ...DEFAULT_WEIGHTS, ...saved.weights },
        sleeper: { ...DEFAULT_SLEEPER, ...saved.sleeper },
        hydrated: true,
      })
    } else {
      set({ hydrated: true })
    }
  },

  draftPlayer(playerId, teamId) {
    const { players, picks, teams, settings } = get()
    if (picks.some((p) => p.playerId === playerId)) return
    const player = players.find((p) => p.id === playerId)
    if (!player) return

    const pickNumber = picks.length + 1
    const round = roundForPick(pickNumber, settings.teams)
    const slot = slotForPick(pickNumber, settings)
    const team = teamId ? teams.find((t) => t.id === teamId) : teamForPick(pickNumber, teams, settings)
    if (!team) return

    const pick: DraftPick = {
      pickNumber,
      round,
      slot,
      teamId: team.id,
      playerId,
      timestamp: Date.now(),
    }
    set({ picks: [...picks, pick] })
  },

  undoLastPick() {
    const { picks } = get()
    if (picks.length === 0) return
    set({ picks: picks.slice(0, -1) })
  },

  resetDraft() {
    set({ picks: [] })
  },

  loadSampleDraft(throughPick) {
    const { players, settings } = get()
    set({ picks: makeSampleDraft(players, settings, throughPick) })
  },

  resetAll() {
    clearState()
    set({ ...initialState(), hydrated: true })
  },

  setPlayers(players) {
    set({ players })
  },

  updatePlayer(id, patch) {
    set({ players: get().players.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  },

  togglePlayerTag(id, tag) {
    set({
      players: get().players.map((p) => {
        if (p.id !== id) return p
        const has = p.tags.includes(tag)
        return { ...p, tags: has ? p.tags.filter((t) => t !== tag) : [...p.tags, tag] }
      }),
    })
  },

  setSettings(patch) {
    const prev = get().settings
    const nextSettings = { ...prev, ...patch }
    let teams = get().teams
    if (
      (patch.teams !== undefined && patch.teams !== prev.teams) ||
      (patch.mySlot !== undefined && patch.mySlot !== prev.mySlot)
    ) {
      teams = rebuildTeams(teams, prev, nextSettings.teams, nextSettings.mySlot)
    }
    set({ settings: nextSettings, teams })
  },

  setWeights(patch) {
    set({ weights: { ...get().weights, ...patch } })
  },

  setTeams(teams) {
    set({ teams })
  },

  renameTeam(id, name) {
    set({ teams: get().teams.map((t) => (t.id === id ? { ...t, name } : t)) })
  },

  setSleeper(patch) {
    set({ sleeper: { ...get().sleeper, ...patch } })
  },

  async sleeperConnect() {
    const { sleeper } = get()
    const adapter = getSleeperAdapter(sleeper.adapter)
    const res = await adapter.verifyUser(sleeper.username)
    if (!res.ok || !res.user) {
      set({ sleeper: { ...get().sleeper, status: 'not-connected', lastError: res.message } })
      return { ok: false, message: res.message }
    }
    set({
      sleeper: {
        ...get().sleeper,
        userId: res.user.userId,
        status: get().sleeper.leagueId ? 'ready-for-import' : 'not-connected',
        lastError: null,
      },
    })
    return { ok: true, message: res.message }
  },

  async sleeperListLeagues() {
    const { sleeper } = get()
    const adapter = getSleeperAdapter(sleeper.adapter)
    if (!sleeper.userId) return { ok: false, message: 'Connect your username first.' }
    const res = await adapter.fetchUserLeagues(sleeper.userId, sleeper.season)
    if (!res.ok) {
      set({ sleeper: { ...get().sleeper, lastError: res.message } })
      return { ok: false, message: res.message }
    }
    return { ok: true, message: res.message, leagues: res.leagues }
  },

  async sleeperImportLeague() {
    const { sleeper, teams } = get()
    const adapter = getSleeperAdapter(sleeper.adapter)
    const leagueRes = await adapter.fetchLeague(sleeper.leagueId, sleeper.season)
    if (!leagueRes.ok || !leagueRes.league) {
      set({ sleeper: { ...get().sleeper, status: 'not-connected', lastError: leagueRes.message } })
      return { ok: false, message: leagueRes.message }
    }
    const league = leagueRes.league

    // Draft info and manager names are nice-to-have; a failure here must not
    // block importing the league itself.
    const draftRes = league.draftId ? await adapter.fetchDraft(league.draftId) : null
    const usersRes = await adapter.fetchLeagueUsers(sleeper.leagueId)

    const imported = importLeague(
      league,
      draftRes?.draft ?? null,
      sleeper.userId,
      teams,
      usersRes.users ?? {},
    )

    get().setSettings(imported.settings)
    get().setTeams(imported.teams)
    set({
      sleeper: {
        ...get().sleeper,
        draftId: league.draftId ?? '',
        status: league.draftId ? 'sync-available' : 'ready-for-import',
        lastError: null,
      },
    })
    return {
      ok: true,
      message: `Imported "${league.name}".`,
      notes: imported.notes,
    }
  },

  async sleeperSyncPicks() {
    const { sleeper, players, teams, settings } = get()
    const adapter = getSleeperAdapter(sleeper.adapter)
    if (!sleeper.draftId) return { ok: false, message: 'Import the league first to find its draft.' }

    const res = await adapter.fetchDraftPicks(sleeper.draftId)
    if (!res.ok || !res.picks) {
      set({ sleeper: { ...get().sleeper, lastError: res.message } })
      return { ok: false, message: res.message }
    }

    const result = reconcilePicks(res.picks, players, teams, settings)
    set({
      picks: result.picks,
      sleeper: {
        ...get().sleeper,
        lastSyncAt: Date.now(),
        lastError: null,
        unmatched: result.unmatched,
      },
    })

    const notes: string[] = []
    if (result.unmatched.length > 0) {
      notes.push(
        `${result.unmatched.length} Sleeper pick(s) had no match on your board. ` +
          'They are listed below - draft those players manually so the board stays right.',
      )
    }
    return {
      ok: true,
      message: `Synced ${result.matched} of ${result.total} pick(s).`,
      notes,
    }
  },

  exportJson() {
    const { players, picks, teams, settings, weights, sleeper } = get()
    return JSON.stringify(toSavedState({ players, picks, teams, settings, weights, sleeper }), null, 2)
  },

  importJson(json) {
    try {
      const parsed = JSON.parse(json)
      if (!parsed || typeof parsed !== 'object') {
        return { ok: false, error: 'Not a valid JSON object.' }
      }
      if (parsed.version !== STATE_VERSION) {
        return { ok: false, error: `Unsupported version "${parsed.version}".` }
      }
      if (!Array.isArray(parsed.players) || !Array.isArray(parsed.picks) || !Array.isArray(parsed.teams)) {
        return { ok: false, error: 'Missing players, picks, or teams array.' }
      }
      if (!parsed.settings || typeof parsed.settings.teams !== 'number') {
        return { ok: false, error: 'Missing or invalid settings.' }
      }
      set({
        players: parsed.players,
        picks: parsed.picks,
        teams: parsed.teams,
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        weights: { ...DEFAULT_WEIGHTS, ...parsed.weights },
        sleeper: { ...DEFAULT_SLEEPER, ...parsed.sleeper },
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Failed to parse JSON.' }
    }
  },
}))

// ---------------------------------------------------------------------------
// Persist on every mutation, debounced so a live draft isn't doing sync
// localStorage writes on the clock.
// ---------------------------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null
const PERSIST_DEBOUNCE_MS = 250

useDraftStore.subscribe((state) => {
  if (!state.hydrated) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    const { players, picks, teams, settings, weights, sleeper } = useDraftStore.getState()
    saveState(toSavedState({ players, picks, teams, settings, weights, sleeper }))
  }, PERSIST_DEBOUNCE_MS)
})

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useEngineContext(): EngineContext {
  const players = useDraftStore((s) => s.players)
  const picks = useDraftStore((s) => s.picks)
  const teams = useDraftStore((s) => s.teams)
  const settings = useDraftStore((s) => s.settings)
  const weights = useDraftStore((s) => s.weights)

  return useMemo(
    () => ({
      players,
      picks,
      teams,
      settings,
      weights,
      currentPick: currentPickNumber(picks),
    }),
    [players, picks, teams, settings, weights],
  )
}

export function useRecommendation(): Recommendation {
  const players = useDraftStore((s) => s.players)
  const picksLength = useDraftStore((s) => s.picks.length)
  const picks = useDraftStore((s) => s.picks)
  const teams = useDraftStore((s) => s.teams)
  const settings = useDraftStore((s) => s.settings)
  const weights = useDraftStore((s) => s.weights)

  return useMemo(
    () =>
      recommend({
        players,
        picks,
        teams,
        settings,
        weights,
        currentPick: currentPickNumber(picks),
      }),
    // picksLength is intentionally included as the cheap, stable proxy for
    // "picks changed" so this doesn't recompute on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, picksLength, teams, settings, weights],
  )
}
