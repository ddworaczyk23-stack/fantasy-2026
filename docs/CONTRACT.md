# Internal API contract

Every module codes against `src/types.ts`. These signatures are fixed. Do not
rename, do not change argument order, do not add required arguments.

## Already written (do not modify)

- `src/types.ts` — all shared types.
- `src/engine/defaults.ts` — `DEFAULT_SETTINGS`, `DEFAULT_ROSTER`, `DEFAULT_WEIGHTS`,
  `DEFAULT_SLEEPER`, `STORAGE_KEY`, `STATE_VERSION`, `normalizeWeights(w)`.
- `src/engine/picks.ts` — snake / pick math:
  `roundForPick`, `indexInRound`, `slotForPick`, `picksForSlot`, `myPickNumbers`,
  `isMyPick`, `nextMyPickFrom`, `myPickAfter`, `picksUntilNext`,
  `currentPickNumber`, `teamForPick`, `myTeam`, `interveningPicks`, `inKDstWindow`.

## `src/data/samplePlayers.ts` (owner: data agent)

```ts
export const SAMPLE_DATA_LABEL: string          // "SAMPLE 2026 PPR BOARD - NOT LIVE DATA"
export const SAMPLE_PLAYERS: Player[]           // >= 150 players
export function makeSamplePlayers(): Player[]   // deep copy, fresh objects
```

## `src/data/sampleLeague.ts` (owner: data agent)

```ts
export function makeSampleTeams(teams: number, mySlot: number): LeagueTeam[]
export function makeSampleDraft(players: Player[], settings: LeagueSettings, throughPick: number): DraftPick[]
export const DRAFT_DAY_CHECKLIST: { text: string; detail: string }[]
```

## `src/engine/*` (owner: engine agent)

```ts
// availability.ts
export function draftedPlayerIds(picks: DraftPick[]): Set<string>
export function availablePlayers(ctx: EngineContext): Player[]
export function effectiveRank(p: Player): number          // customRank ?? overallRank

// tiers.ts
export function getTierStates(ctx: EngineContext): TierState[]
export function getTierAlerts(ctx: EngineContext, roster: RosterAnalysis): TierAlert[]

// roster.ts
export function analyzeRoster(teamId: string, ctx: EngineContext): RosterAnalysis
export function teamNeeds(ctx: EngineContext): TeamNeed[]

// room.ts
export function detectRuns(ctx: EngineContext, window?: number): PositionalRun[]
export function readDraftRoom(ctx: EngineContext): DraftRoomRead

// wait.ts
export function survivalProbability(player: Player, ctx: EngineContext): number
export function canIWait(player: Player, ctx: EngineContext): WaitAnalysis

// score.ts
export function scorePlayer(player: Player, ctx: EngineContext, roster: RosterAnalysis, tiers: TierState[], room: DraftRoomRead): ScoredPlayer
export function scoreAvailable(ctx: EngineContext): ScoredPlayer[]   // sorted desc by score

// cautions.ts
export function getCautions(ctx: EngineContext, scored: ScoredPlayer[]): Caution[]

// recommend.ts
export function recommend(ctx: EngineContext): Recommendation

// index.ts  -- re-export everything above plus defaults.ts and picks.ts
```

Rules: pure functions only. No `Date.now()` inside scoring. No React imports.
Never throw on empty input — return empty/neutral results.

## `src/store/draftStore.ts` (owner: store agent)

Zustand store. Shape:

```ts
interface DraftStore {
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

  exportJson(): string
  importJson(json: string): { ok: boolean; error?: string }
}

export const useDraftStore: UseBoundStore<StoreApi<DraftStore>>
export function useEngineContext(): EngineContext      // memoised selector hook
export function useRecommendation(): Recommendation    // memoised
```

`draftPlayer` with no `teamId` assigns the team that owns the current pick.

## `src/services/*` (owner: store agent)

```ts
// persistence.ts
export function saveState(s: SavedState): void
export function loadState(): SavedState | null
export function clearState(): void

// csv.ts
export const CSV_HEADERS: string[]
export function csvTemplate(): string
export function playersToCsv(players: Player[]): string
export function parsePlayersCsv(text: string): CsvImportResult
export function downloadText(filename: string, text: string): void

// sleeperAdapter.ts  -- mock-only, documented placeholder
export interface SleeperAdapter { ... }
export const mockSleeperAdapter: SleeperAdapter
export function describeSleeperStatus(s: SleeperStatus): { label: string; detail: string; tone: 'neutral'|'good'|'warn' }
```

## `src/views/*` + `src/components/*` (owner: UI agent)

Views: `DraftRoom.tsx`, `MyTeam.tsx`, `Rankings.tsx`, `LeagueIntel.tsx`,
`SettingsView.tsx`. Each is a default export, takes no props, reads the store.
`src/App.tsx` owns tab navigation. `src/styles.css` owns all styling.
