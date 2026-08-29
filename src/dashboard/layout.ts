export type PanelId =
  | 'draft-now'
  | 'available-players'
  | 'alternatives'
  | 'strategy'
  | 'can-i-wait'
  | 'tier-alerts'
  | 'my-roster'
  | 'room-read'
  | 'cautions'
  | 'draft-history'
  | 'draft-board'

export type PanelSpan = 1 | 2 | 3

export interface DashboardLayoutEntry {
  id: PanelId
  span: PanelSpan
}

export type DashboardLayout = DashboardLayoutEntry[]

export const DASHBOARD_LAYOUT_VERSION = 1

// Grid packing quantum: each tile's height is measured and converted to a
// `grid-row: span N` in these units, so short and tall tiles don't stretch
// to match their row-mates. Must match the values baked into the
// `.draft-room` grid-auto-rows / gap rules in styles.css.
export const GRID_ROW_UNIT_PX = 8
export const GRID_GAP_PX = 14

// Draft Now (span 1) followed by Available Players (span 2) lands them on
// the same row via CSS Grid auto-placement: Draft Now top-left, Available
// Players spanning top-middle + top-right.
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = [
  { id: 'draft-now', span: 1 },
  { id: 'available-players', span: 2 },
  { id: 'alternatives', span: 1 },
  { id: 'strategy', span: 1 },
  { id: 'can-i-wait', span: 1 },
  { id: 'tier-alerts', span: 1 },
  { id: 'my-roster', span: 1 },
  { id: 'room-read', span: 1 },
  { id: 'cautions', span: 1 },
  { id: 'draft-history', span: 1 },
  { id: 'draft-board', span: 1 },
]

const DEFAULT_IDS = new Set(DEFAULT_DASHBOARD_LAYOUT.map((e) => e.id))

/**
 * Reconcile a saved layout against the current panel set: drop ids that no
 * longer exist, append any new panel ids (in default order) that the saved
 * layout predates.
 */
export function reconcileDashboardLayout(saved: DashboardLayout): DashboardLayout {
  const known = saved.filter((e) => DEFAULT_IDS.has(e.id))
  const seen = new Set(known.map((e) => e.id))
  const missing = DEFAULT_DASHBOARD_LAYOUT.filter((e) => !seen.has(e.id))
  return [...known, ...missing]
}
