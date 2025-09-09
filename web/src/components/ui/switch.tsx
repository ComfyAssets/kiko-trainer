
// React import removed - not needed for modern React

type Props = {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  id?: string
  ariaLabel?: string
  ariaLabelledby?: string
}
export function Switch({ checked, onCheckedChange, id, ariaLabel, ariaLabelledby }: Props) {
  return (
    <button
      id={id}
      onClick={() => onCheckedChange(!checked)}
      className={
        'w-12 h-7 rounded-full transition-all ' + (checked ? 'bg-primary' : 'bg-gray-600')
      }
      aria-pressed={checked}
      role="switch"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
    >
      <span
        className={
          'block w-5 h-5 bg-black rounded-full mt-1 transition-transform ' + (checked ? 'translate-x-6' : 'translate-x-1')
        }
      />
    </button>
  )
}
