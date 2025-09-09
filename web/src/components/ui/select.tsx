
import React from 'react'

type Option = { value: string; label: string }
type Props = React.SelectHTMLAttributes<HTMLSelectElement> & { options: Option[] }

export function Select({ options, ...props }: Props) {
  return (
    <select
      className="w-full h-10 rounded-md bg-muted/70 border px-3 focus-ring"
      {...props}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
