'use client'

import { createElement } from 'react'
import type {
  CSSProperties,
  ComponentPropsWithoutRef,
  ElementType,
  ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

type TextShimmerOwnProps<TElement extends ElementType = 'span'> = {
  as?: TElement
  duration?: number
  spread?: number
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export type TextShimmerProps<TElement extends ElementType = 'span'> =
  TextShimmerOwnProps<TElement> &
    Omit<ComponentPropsWithoutRef<TElement>, keyof TextShimmerOwnProps>

export function TextShimmer<TElement extends ElementType = 'span'>({
  as,
  className,
  duration = 4,
  spread = 20,
  children,
  style,
  ...props
}: TextShimmerProps<TElement>) {
  const dynamicSpread = Math.min(Math.max(spread, 5), 45)
  const Component = as ?? 'span'
  const shimmerStyle: CSSProperties = {
    ...style,
    backgroundImage: `linear-gradient(to right, var(--color-primary-600) ${50 - dynamicSpread}%, var(--color-primary-950) 50%, var(--color-primary-600) ${50 + dynamicSpread}%)`,
    animationDuration: `${duration}s`,
  }

  return createElement(
    Component,
    {
      ...props,
      className: cn(
        'bg-size-[200%_auto] bg-clip-text font-medium text-transparent',
        'animate-[shimmer_4s_infinite_linear]',
        className,
      ),
      style: shimmerStyle,
    },
    children,
  )
}
