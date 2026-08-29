import type { DraftPick, EngineContext, LeagueSettings, LeagueTeam } from '../types'

/** 1-based round for an overall pick number. */
export function roundForPick(pickNumber: number, teams: number): number {
  return Math.floor((pickNumber - 1) / teams) + 1
}

/** 1-based index within the round (1..teams) for an overall pick number. */
export function indexInRound(pickNumber: number, teams: number): number {
  return ((pickNumber - 1) % teams) + 1
}

/**
 * Which draft slot owns a given overall pick number.
 * Handles linear, snake, and snake + third-round reversal.
 */
export function slotForPick(pickNumber: number, settings: LeagueSettings): number {
  const { teams, snake, thirdRoundReversal } = settings
  const round = roundForPick(pickNumber, teams)
  const idx = indexInRound(pickNumber, teams)
  if (!snake) return idx

  let reversed = round % 2 === 0
  if (thirdRoundReversal && round >= 3) reversed = !reversed
  return reversed ? teams - idx + 1 : idx
}

/**
 * Which slot actually OWNS a pick right now.
 *
 * `slotForPick` answers the board-order question ("whose turn is this in the
 * snake"). This answers the ownership question, which differs whenever a draft
 * pick has been traded. A `pickOwners` entry always wins over snake math.
 */
export function ownerSlotForPick(pickNumber: number, settings: LeagueSettings): number {
  const traded = settings.pickOwners?.[pickNumber]
  if (typeof traded === 'number' && traded >= 1 && traded <= settings.teams) return traded
  return slotForPick(pickNumber, settings)
}

/** All overall pick numbers owned by a slot, across the whole draft. */
export function picksForSlot(slot: number, settings: LeagueSettings): number[] {
  const total = settings.teams * settings.rounds
  const out: number[] = []
  for (let p = 1; p <= total; p++) {
    if (ownerSlotForPick(p, settings) === slot) out.push(p)
  }
  return out
}

/**
 * The overall pick numbers that belong to ME.
 * An explicit override list always wins over snake math.
 */
export function myPickNumbers(settings: LeagueSettings): number[] {
  const total = settings.teams * settings.rounds
  if (settings.myPickOverrides && settings.myPickOverrides.length > 0) {
    return [...settings.myPickOverrides]
      .filter((p) => Number.isFinite(p) && p >= 1 && p <= total)
      .sort((a, b) => a - b)
  }
  return picksForSlot(settings.mySlot, settings)
}

/** True when the pick currently on the clock is mine. */
export function isMyPick(pickNumber: number, settings: LeagueSettings): boolean {
  return myPickNumbers(settings).includes(pickNumber)
}

/** My next pick at or after `fromPick`. Null when the draft is over for me. */
export function nextMyPickFrom(fromPick: number, settings: LeagueSettings): number | null {
  const mine = myPickNumbers(settings)
  return mine.find((p) => p >= fromPick) ?? null
}

/** My next pick strictly after `fromPick`. Null when I have no more picks. */
export function myPickAfter(fromPick: number, settings: LeagueSettings): number | null {
  const mine = myPickNumbers(settings)
  return mine.find((p) => p > fromPick) ?? null
}

/**
 * How many picks happen between now and my next selection.
 * When I am on the clock, this is the gap to my FOLLOWING pick.
 * When I am not on the clock, this is the gap to my upcoming pick.
 */
export function picksUntilNext(ctx: EngineContext): number {
  const { currentPick, settings } = ctx
  const mine = isMyPick(currentPick, settings)
  const target = mine ? myPickAfter(currentPick, settings) : nextMyPickFrom(currentPick, settings)
  if (target === null) return 0
  return Math.max(0, target - currentPick - (mine ? 1 : 0))
}

/** The overall pick number on the clock, given the picks already made. */
export function currentPickNumber(picks: DraftPick[]): number {
  return picks.length + 1
}

/** Team that owns a given overall pick number. */
export function teamForPick(
  pickNumber: number,
  teams: LeagueTeam[],
  settings: LeagueSettings,
): LeagueTeam | null {
  const slot = ownerSlotForPick(pickNumber, settings)
  return teams.find((t) => t.slot === slot) ?? null
}

/** My team record. */
export function myTeam(teams: LeagueTeam[]): LeagueTeam | null {
  return teams.find((t) => t.isMe) ?? null
}

/**
 * The overall pick numbers between the current pick and my next pick,
 * exclusive of my own picks. These are the picks that can steal my target.
 */
export function interveningPicks(ctx: EngineContext): number[] {
  const { currentPick, settings } = ctx
  const mine = isMyPick(currentPick, settings)
  const target = mine ? myPickAfter(currentPick, settings) : nextMyPickFrom(currentPick, settings)
  if (target === null) return []
  const start = mine ? currentPick + 1 : currentPick
  const out: number[] = []
  for (let p = start; p < target; p++) out.push(p)
  return out
}

/** True when we are inside the final N rounds (the DST/K window). */
export function inKDstWindow(ctx: EngineContext): boolean {
  const { settings, currentPick } = ctx
  const round = roundForPick(currentPick, settings.teams)
  return round > settings.rounds - settings.kdstLastRounds
}
