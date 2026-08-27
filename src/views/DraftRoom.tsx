import { useEffect, useMemo, useRef, useState } from 'react'
import { useDraftStore, useEngineContext, useRecommendation } from '../store/draftStore'
import { scoreAvailable } from '../engine'
import { teamForPick } from '../engine/picks'
import EmptyState from '../components/EmptyState'
import KeyboardHelpOverlay from '../components/KeyboardHelpOverlay'
import DraftNowCard from '../components/draftroom/DraftNowCard'
import AlternativesList from '../components/draftroom/AlternativesList'
import StrategyPanel from '../components/draftroom/StrategyPanel'
import CanIWaitPanel from '../components/draftroom/CanIWaitPanel'
import AvailablePlayersPanel from '../components/draftroom/AvailablePlayersPanel'
import TierAlertPanel from '../components/draftroom/TierAlertPanel'
import MyRosterPanel from '../components/draftroom/MyRosterPanel'
import RoomReadPanel from '../components/draftroom/RoomReadPanel'
import CautionsPanel from '../components/draftroom/CautionsPanel'
import DraftHistoryPanel from '../components/draftroom/DraftHistoryPanel'
import DraftBoardPanel from '../components/draftroom/DraftBoardPanel'

export default function DraftRoom() {
  const players = useDraftStore((s) => s.players)
  const picks = useDraftStore((s) => s.picks)
  const teams = useDraftStore((s) => s.teams)
  const settings = useDraftStore((s) => s.settings)
  const draftPlayer = useDraftStore((s) => s.draftPlayer)
  const undoLastPick = useDraftStore((s) => s.undoLastPick)

  const ctx = useEngineContext()
  const recommendation = useRecommendation()

  const [search, setSearch] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [visibleRowIds, setVisibleRowIds] = useState<string[]>([])
  const searchRef = useRef<HTMLInputElement | null>(null)

  // Compute scoreAvailable exactly once per render for the whole view.
  const scored = useMemo(() => scoreAvailable(ctx), [ctx])

  const draftComplete = picks.length >= settings.teams * settings.rounds
  const clockTeam = teamForPick(ctx.currentPick, teams, settings)

  function handleDraft(playerId: string) {
    draftPlayer(playerId)
  }
  function handleMarkDrafted(playerId: string, teamId: string) {
    draftPlayer(playerId, teamId)
  }

  useEffect(() => {
    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }

    function onKeyDown(e: KeyboardEvent) {
      const typing = isTypingTarget(e.target)

      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === 'Escape') {
        if (helpOpen) setHelpOpen(false)
        else if (search) setSearch('')
        else searchRef.current?.blur()
        return
      }
      if (typing) return

      if (e.key === '?') {
        setHelpOpen((v) => !v)
        return
      }
      if (e.key === 'd') {
        if (recommendation.primary) handleDraft(recommendation.primary.player.id)
        return
      }
      if (e.key === 'u') {
        undoLastPick()
        return
      }
      if (e.key >= '1' && e.key <= '6') {
        const idx = Number(e.key) - 1
        const id = visibleRowIds[idx]
        if (id) handleDraft(id)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helpOpen, search, visibleRowIds, recommendation.primary])

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const top = visibleRowIds[0]
      if (top) handleDraft(top)
    }
  }

  if (players.length === 0) {
    return (
      <EmptyState
        title="No players loaded"
        description="Load the bundled sample board from Settings to try the app, or import your own CSV in Rankings."
      />
    )
  }

  return (
    <div className="draft-room">
      <div className="draft-room__col">
        <DraftNowCard
          recommendation={recommendation}
          onDraft={handleDraft}
          clockTeamName={clockTeam?.name ?? ''}
        />
        <AlternativesList alternatives={recommendation.alternatives} onDraft={handleDraft} />
        <StrategyPanel strategyExplanation={recommendation.strategyExplanation} primary={recommendation.primary} />
      </div>

      <div className="draft-room__col">
        <CanIWaitPanel waitAnalysis={recommendation.waitAnalysis} />
        <div onKeyDown={handleSearchKeyDown}>
          <AvailablePlayersPanel
            ref={searchRef}
            scored={scored}
            teams={teams}
            onDraft={handleDraft}
            onMarkDrafted={handleMarkDrafted}
            search={search}
            onSearchChange={setSearch}
            onVisibleRowsChange={setVisibleRowIds}
          />
        </div>
        <TierAlertPanel alerts={recommendation.tierAlerts} />
      </div>

      <div className="draft-room__col">
        <MyRosterPanel roster={recommendation.roster} />
        <RoomReadPanel roomRead={recommendation.roomRead} />
        <CautionsPanel cautions={recommendation.cautions} />
        <DraftHistoryPanel picks={picks} players={players} teams={teams} settings={settings} onUndo={undoLastPick} />
        <DraftBoardPanel picks={picks} players={players} teams={teams} settings={settings} />
      </div>

      {draftComplete && (
        <div style={{ gridColumn: '1 / -1' }}>
          <EmptyState title="Draft complete" description="All picks have been made. Review your team on My Team, or export your results from Settings." />
        </div>
      )}

      {helpOpen && <KeyboardHelpOverlay onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
