import type { ReactNode } from 'react'

export default function Panel({
  title,
  subtitle,
  right,
  children,
  scroll,
  tall,
  className,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  scroll?: boolean
  tall?: boolean
  className?: string
}) {
  const cls = ['panel']
  if (scroll) cls.push('panel--scroll')
  if (tall) cls.push('panel--tall')
  if (className) cls.push(className)
  return (
    <section className={cls.join(' ')} aria-label={title}>
      <div className="panel__header">
        <div>
          <h2 className="panel__title">{title}</h2>
          {subtitle && <div className="panel__subtitle">{subtitle}</div>}
        </div>
        {right}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  )
}
