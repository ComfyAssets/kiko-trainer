
import React from 'react'
import clsx from 'classnames'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props}, ref) => (
    <textarea
      ref={ref}
      className={clsx('w-full min-h-[120px] rounded-md bg-muted/70 border px-3 py-2 focus-ring placeholder:text-gray-400', className)}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'
