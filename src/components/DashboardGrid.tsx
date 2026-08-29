import { useEffect, useState } from 'react'
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
import { DEFAULT_DASHBOARD_LAYOUT } from '../dashboard/layout'
import { loadDashboardLayout, saveDashboardLayout } from '../services/persistence'

const NEXT_SPAN: Record<PanelSpan, PanelSpan> = { 1: 2, 2: 3, 3: 1 }

export default function DashboardGrid({ panels }: { panels: Record<PanelId, ReactNode> }) {
  const [layout, setLayout] = useState<DashboardLayout>(() => loadDashboardLayout() ?? DEFAULT_DASHBOARD_LAYOUT)

  useEffect(() => {
    saveDashboardLayout(layout)
  }, [layout])

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
        <button type="button" className="btn btn-sm" onClick={handleReset}>
          Reset layout
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={layout.map((e) => e.id)}>
          <div className="draft-room">
            {layout.map((entry) => (
              <DashboardTile key={entry.id} id={entry.id} span={entry.span} onCycleSpan={handleCycleSpan}>
                {panels[entry.id]}
              </DashboardTile>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
