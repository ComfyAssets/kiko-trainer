
import React from 'react'

type Props = React.InputHTMLAttributes<HTMLInputElement>
export function Slider(props: Props) {
  return (
    <input type="range" className="w-full accent-primary" {...props} />
  )
}
