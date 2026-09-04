'use client'

import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--theme-accent)_55%,transparent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0] select-none duration-150',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3',
        lg: 'h-10 px-5',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-md': 'size-10',
        'icon-xl': 'size-11 [&_svg]:size-5',
      },
      variant: {
        default:
          'bg-[var(--theme-accent)] text-[var(--theme-bg)] hover:opacity-90 shadow-sm outline outline-[color-mix(in_srgb,var(--theme-accent)_28%,transparent)]',
        secondary:
          'bg-primary-50 text-primary-950 hover:bg-primary-200 outline outline-primary-900/10 shadow-2xs',
        outline:
          'border-primary-200 bg-transparent text-primary-900 hover:bg-primary-50 shadow-2xs outline outline-primary-900/10',
        ghost: 'text-primary-900 hover:bg-primary-200 hover:text-primary-950',
        destructive: 'bg-red-600 text-primary-50 hover:bg-red-700 shadow-sm',
      },
    },
  },
)

interface ButtonProps extends useRender.ComponentProps<'button'> {
  variant?: VariantProps<typeof buttonVariants>['variant']
  size?: VariantProps<typeof buttonVariants>['size']
}

function Button({ className, variant, size, render, ...props }: ButtonProps) {
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>['type'] =
    render ? undefined : 'button'

  const defaultProps = {
    className: cn(buttonVariants({ className, size, variant })),
    'data-slot': 'button',
    type: typeValue,
  }

  return useRender({
    defaultTagName: 'button',
    props: mergeProps<'button'>(defaultProps, props),
    render,
  })
}

export { Button, buttonVariants }
