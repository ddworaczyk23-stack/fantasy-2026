import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PanelId, PanelSpan } from '../dashboard/layout'
import { GRID_GAP_PX, GRID_ROW_UNIT_PX } from '../dashboard/layout'

const SPAN_LABEL: Record<PanelSpan, string> = { 1: 'Narrow', 2: 'Medium', 3: 'Wide' }

export default function DashboardTile({
  id,
  span,
  onCycleSpan,
  children,
}: {
  id: PanelId
  span: PanelSpan
  onCycleSpan: (id: PanelId) => void
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [rowSpan, setRowSpan] = useState(1)

  // Convert the tile's real rendered height into a grid-row span so it only
  // takes the vertical space it needs, letting shorter/taller neighbours
  // pack into the same visual row instead of all stretching to match.
  useEffect(() => {
    const el = contentRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? el.offsetHeight
      const span = Math.max(1, Math.ceil((height + GRID_GAP_PX) / (GRID_ROW_UNIT_PX + GRID_GAP_PX)))
      setRowSpan(span)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={setNodeRef}
      className={`dashboard-tile${isDragging ? ' dashboard-tile--dragging' : ''}`}
      style={{
        gridColumn: `span ${span}`,
        gridRow: `span ${rowSpan}`,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div ref={contentRef}>
        <div className="dashboard-tile__toolbar">
          <button
            type="button"
            className="icon-btn btn-sm dashboard-tile__handle"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
          <button
            type="button"
            className="icon-btn btn-sm"
            onClick={() => onCycleSpan(id)}
            aria-label={`Panel width: ${SPAN_LABEL[span]}. Click to change.`}
          >
            {SPAN_LABEL[span]}
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
