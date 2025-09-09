
import React from 'react'
import clsx from 'classnames'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'w-full h-10 rounded-md bg-muted/70 border px-3 focus-ring placeholder:text-gray-400',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
