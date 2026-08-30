// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadState } from '../../services/persistence'
import { useDraftStore } from '../draftStore'

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useDraftStore.getState().hydrate()
})

describe('league store actions', () => {
  it('creates a fresh league and switches into it', () => {
    const store = useDraftStore.getState()
    const originalId = store.leagueId
    store.draftPlayer(store.players[0].id)

    const id = useDraftStore.getState().createLeague('Work league')
    const next = useDraftStore.getState()
    expect(next.leagueId).toBe(id)
    expect(next.leagues).toHaveLength(2)
    expect(next.leagues.find((league) => league.id === id)?.name).toBe('Work league')
    expect(next.picks).toEqual([])
    expect(loadState(originalId)?.picks).toHaveLength(1)
  })

  it('keeps draft data isolated while switching', () => {
    const a = useDraftStore.getState().leagueId
    const aPlayer = useDraftStore.getState().players[0].id
    useDraftStore.getState().draftPlayer(aPlayer)
    const b = useDraftStore.getState().createLeague('League B')
    useDraftStore.getState().setSettings({ teams: 10 })
    useDraftStore.getState().switchLeague(a)

    expect(useDraftStore.getState().picks.map((pick) => pick.playerId)).toEqual([aPlayer])
    expect(useDraftStore.getState().settings.teams).toBe(12)
    useDraftStore.getState().switchLeague(b)
    expect(useDraftStore.getState().picks).toEqual([])
    expect(useDraftStore.getState().settings.teams).toBe(10)
  })

  it('flushes a pending edit before switching leagues', () => {
    const a = useDraftStore.getState().leagueId
    const b = useDraftStore.getState().createLeague('League B')
    useDraftStore.getState().switchLeague(a)
    useDraftStore.getState().setSettings({ rounds: 17 })
    useDraftStore.getState().switchLeague(b)

    expect(loadState(a)?.settings.rounds).toBe(17)
  })

  it('renames leagues and safely deletes them', () => {
    const a = useDraftStore.getState().leagueId
    useDraftStore.getState().renameLeague(a, 'Home league')
    expect(useDraftStore.getState().leagues[0].name).toBe('Home league')

    useDraftStore.getState().deleteLeague(a)
    expect(useDraftStore.getState().leagueId).toBe(a)
    const b = useDraftStore.getState().createLeague('League B')
    useDraftStore.getState().deleteLeague(b)
    expect(useDraftStore.getState().leagueId).toBe(a)
    expect(loadState(b)).toBeNull()
  })

  it('imports into a new league without changing the current league data', () => {
    const a = useDraftStore.getState().leagueId
    const playerId = useDraftStore.getState().players[0].id
    useDraftStore.getState().draftPlayer(playerId)
    const json = useDraftStore.getState().exportJson()
    useDraftStore.getState().resetDraft()

    const result = useDraftStore.getState().importJsonToNewLeague(json, 'Imported league')
    expect(result.ok).toBe(true)
    expect(useDraftStore.getState().leagueId).toBe(result.leagueId)
    expect(useDraftStore.getState().picks.map((pick) => pick.playerId)).toEqual([playerId])
    expect(loadState(a)?.picks).toEqual([])
  })
})
