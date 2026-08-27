import type { DraftRoomRead } from '../../types'
import Panel from '../Panel'
import PositionPill from '../PositionPill'
import Chip from '../Chip'

export default function RoomReadPanel({ roomRead }: { roomRead: DraftRoomRead }) {
  const activeRuns = roomRead.runs.filter((r) => r.active)
  return (
    <Panel title="Draft Room Read" subtitle="What's happening around the room" scroll>
      {roomRead.summary.length > 0 && (
        <ul className="reasons-list">
          {roomRead.summary.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}

      {activeRuns.length > 0 && (
        <div className="mt-md">
          <div className="text-xs text-muted font-bold">ACTIVE RUNS</div>
          <div className="flex-row flex-wrap mt-sm">
            {activeRuns.map((r) => (
              <Chip tone="warn" icon="⚠" key={r.position}>
                {r.position} run: {r.countInWindow}/{r.window}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {roomRead.teamsBeforeNextPick.length > 0 && (
        <div className="mt-md">
          <div className="text-xs text-muted font-bold">TEAMS BEFORE MY NEXT PICK</div>
          <div className="flex-col mt-sm">
            {roomRead.teamsBeforeNextPick.map((t) => (
              <div key={t.teamId} className="slot-row">
                <span className="font-bold" style={{ minWidth: 110 }}>
                  {t.teamName}
                </span>
                <div className="flex-row flex-wrap gap-sm">
                  {t.needs.slice(0, 4).map((n) => (
                    <PositionPill key={n} position={n} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}
