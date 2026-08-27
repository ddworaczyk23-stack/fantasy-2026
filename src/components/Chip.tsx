import type { ReactNode } from 'react'

export type ChipTone = 'neutral' | 'good' | 'warn' | 'critical' | 'accent'

const SEVERITY_ICON: Record<string, string> = {
  info: 'i',
  warn: '⚠',
  critical: '✖',
}

export default function Chip({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode
  tone?: ChipTone
  icon?: string
}) {
  return (
    <span className={`chip chip-${tone}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  )
}

/** Chip preset for engine 'info' | 'warn' | 'critical' severities: icon + text, never color-only. */
export function SeverityChip({ severity, children }: { severity: 'info' | 'warn' | 'critical'; children: ReactNode }) {
  const tone: ChipTone = severity === 'critical' ? 'critical' : severity === 'warn' ? 'warn' : 'neutral'
  return (
    <Chip tone={tone} icon={SEVERITY_ICON[severity]}>
      {children}
    </Chip>
  )
}
