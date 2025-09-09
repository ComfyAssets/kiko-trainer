
import React from 'react'
import clsx from 'classnames'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = React.forwardRef<HTMLButtonElement, Props>(
  ({ className, variant='default', size='md', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center rounded-md font-normal transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-offset-2 focus:ring-offset-background'
    const variants: Record<string,string> = {
      default: 'border border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 hover:text-white',
      outline: 'border border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 hover:text-white',
      ghost: 'text-zinc-400 hover:text-white hover:bg-zinc-800',
      destructive: 'border border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 hover:text-white'
    }
    const sizes: Record<string,string> = {
      sm: 'h-9 px-4 text-sm gap-2',
      md: 'h-10 px-5 text-sm gap-2',
      lg: 'h-11 px-6 text-base gap-2.5'
    }
    return <button ref={ref} className={clsx(base, variants[variant], sizes[size], className)} {...props} />
  }
)
Button.displayName = 'Button'
