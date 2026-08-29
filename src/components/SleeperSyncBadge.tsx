import { useEffect, useState } from 'react'
import { useDraftStore } from '../store/draftStore'

/** Compact, always-visible sync status for the header. Full controls live in Settings. */
export default function SleeperSyncBadge() {
  const sleeper = useDraftStore((s) => s.sleeper)
  const [, forceTick] = useState(0)

  // Re-render every second so "Xs ago" stays live without a full sync.
  useEffect(() => {
    if (!sleeper.draftId) return
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [sleeper.draftId])

  if (!sleeper.draftId) return null

  const secsSince = sleeper.lastSyncAt ? Math.round((Date.now() - sleeper.lastSyncAt) / 1000) : null
  const stale = sleeper.autoSync && secsSince !== null && secsSince > sleeper.pollSeconds * 3

  let tone: 'good' | 'warn' | 'neutral' = 'neutral'
  let label = 'Sync off'
  if (sleeper.lastError) {
    tone = 'warn'
    label = 'Sync error'
  } else if (sleeper.autoSync) {
    tone = stale ? 'warn' : 'good'
    label = stale ? 'Sync stalled' : 'Live sync'
  } else if (secsSince !== null) {
    tone = 'neutral'
    label = 'Manual sync'
  }

  const detail =
    secsSince === null ? 'no sync yet' : secsSince < 5 ? 'just now' : `${secsSince}s ago`

  return (
    <div
      className="row gap-sm items-center sleeper-sync-badge"
      title={sleeper.lastError ?? `Last synced ${detail}`}
    >
      <span className={`status-dot status-${tone}`} aria-hidden="true" />
      <span className="text-sm">
        {label} · {detail}
      </span>
    </div>
  )
}
