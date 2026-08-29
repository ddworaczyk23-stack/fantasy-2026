import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import DashboardTile from './DashboardTile'
import type { DashboardLayout, PanelId, PanelSpan } from '../dashboard/layout'
import { DEFAULT_DASHBOARD_LAYOUT, GRID_GAP_PX, columnsForWidth } from '../dashboard/layout'
import { loadDashboardLayout, saveDashboardLayout } from '../services/persistence'

const NEXT_SPAN: Record<PanelSpan, PanelSpan> = { 1: 2, 2: 3, 3: 1 }

interface TilePosition {
  top: number
  left: string
  width: string
}

/**
 * Deterministic masonry pack: walk `layout` strictly in order, place each
 * entry in the least-filled valid set of adjacent columns. Output depends
 * only on (layout, heights, columns) — never on incidental render timing —
 * so a height change (e.g. toggling the edit toolbar) reflows tiles without
 * ever reordering them relative to the saved layout.
 */
function packLayout(layout: DashboardLayout, heights: Partial<Record<PanelId, number>>, columns: number) {
  const colHeights = new Array(columns).fill(0)
  const positions: Partial<Record<PanelId, TilePosition>> = {}
  let maxHeight = 0

  for (const entry of layout) {
    const span = Math.min(entry.span, columns)
    let bestCol = 0
    let bestTop = Infinity
    for (let c = 0; c <= columns - span; c++) {
      const top = Math.max(...colHeights.slice(c, c + span))
      if (top < bestTop) {
        bestTop = top
        bestCol = c
      }
    }
    const colWidth = `calc((100% - ${GRID_GAP_PX * (columns - 1)}px) / ${columns})`
    const left = `calc(${bestCol} * (${colWidth} + ${GRID_GAP_PX}px))`
    const width = span === 1 ? colWidth : `calc(${span} * ${colWidth} + ${(span - 1) * GRID_GAP_PX}px)`
    positions[entry.id] = { top: bestTop, left, width }

    const tileHeight = heights[entry.id] ?? 0
    const bottom = bestTop + tileHeight + (tileHeight > 0 ? GRID_GAP_PX : 0)
    for (let c = bestCol; c < bestCol + span; c++) colHeights[c] = bottom
    maxHeight = Math.max(maxHeight, bottom)
  }

  return { positions, containerHeight: maxHeight }
}

function useColumnCount(): number {
  const [columns, setColumns] = useState(() =>
    columnsForWidth(typeof window === 'undefined' ? 0 : window.innerWidth),
  )
  useEffect(() => {
    function onResize() {
      setColumns(columnsForWidth(window.innerWidth))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return columns
}

export default function DashboardGrid({ panels }: { panels: Record<PanelId, ReactNode> }) {
  const [layout, setLayout] = useState<DashboardLayout>(() => loadDashboardLayout() ?? DEFAULT_DASHBOARD_LAYOUT)
  const [heights, setHeights] = useState<Partial<Record<PanelId, number>>>({})
  const [editMode, setEditMode] = useState(false)
  const columns = useColumnCount()

  useEffect(() => {
    saveDashboardLayout(layout)
  }, [layout])

  function handleHeightChange(id: PanelId, height: number) {
    setHeights((prev) => (prev[id] === height ? prev : { ...prev, [id]: height }))
  }

  const { positions, containerHeight } = useMemo(
    () => packLayout(layout, heights, columns),
    [layout, heights, columns],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLayout((prev) => {
      const from = prev.findIndex((e) => e.id === active.id)
      const to = prev.findIndex((e) => e.id === over.id)
      if (from === -1 || to === -1) return prev
      return arrayMove(prev, from, to)
    })
  }

  function handleCycleSpan(id: PanelId) {
    setLayout((prev) => prev.map((e) => (e.id === id ? { ...e, span: NEXT_SPAN[e.span] } : e)))
  }

  function handleReset() {
    setLayout(DEFAULT_DASHBOARD_LAYOUT)
  }

  return (
    <div>
      <div className="dashboard-toolbar">
        <button type="button" className="btn btn-sm" onClick={() => setEditMode((v) => !v)} aria-pressed={editMode}>
          {editMode ? 'Done editing' : 'Edit layout'}
        </button>
        {editMode && (
          <button type="button" className="btn btn-sm" onClick={handleReset}>
            Reset layout
          </button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={layout.map((e) => e.id)}>
          <div className="draft-room" style={{ height: containerHeight || undefined }}>
            {layout.map((entry) => {
              const pos = positions[entry.id]
              return (
                <DashboardTile
                  key={entry.id}
                  id={entry.id}
                  span={entry.span}
                  editMode={editMode}
                  top={pos?.top ?? 0}
                  left={pos?.left ?? '0'}
                  width={pos?.width ?? '100%'}
                  onCycleSpan={handleCycleSpan}
                  onHeightChange={handleHeightChange}
                >
                  {panels[entry.id]}
                </DashboardTile>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
