
// React import removed - not needed for modern React
import clsx from 'classnames'

type Tab = { value: string; label: string }
type Props = {
  tabs: Tab[]
  value: string
  onValueChange: (v: string) => void
  className?: string
}
export function Tabs({ tabs, value, onValueChange, className }: Props) {
  return (
    <div className={clsx('flex items-center gap-1 p-1 rounded-lg bg-muted border', className)}>
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onValueChange(t.value)}
          className={clsx(
            'px-4 py-2 rounded-md text-sm',
            value === t.value ? 'bg-card shadow-soft' : 'opacity-70 hover:opacity-100'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
