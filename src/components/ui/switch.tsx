'use client'

import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

import { cn } from '@/lib/utils'

/**
 * Switch with explicit ON/OFF text inside the track.
 *
 * The plain dark/light pill version (#284) made it ambiguous which side
 * was the 'on' state, especially in dark themes where the unchecked grey
 * and checked dark-blue tones read similarly. The visible ON/OFF labels
 * remove the ambiguity without breaking the existing API.
 *
 * The thumb sits over the active label and hides it; the inactive label
 * shows on the opposite side of the track. data-checked toggles which
 * side is which.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-[calc(var(--thumb-size)+2px)] w-[calc(var(--thumb-size)*2.4-2px)] shrink-0 items-center rounded-full p-px outline-none transition-[background-color,box-shadow] duration-200 [--thumb-size:--spacing(5)] focus-visible:ring-2 focus-visible:ring-primary-950 focus-visible:ring-offset-1 focus-visible:ring-offset-background data-checked:bg-emerald-600 data-unchecked:bg-primary-300 dark:data-unchecked:bg-neutral-600 border border-primary-300 dark:border-neutral-500 data-checked:border-emerald-700 data-disabled:opacity-64 sm:[--thumb-size:--spacing(4)]',
        className,
      )}
      data-slot="switch"
      {...props}
    >
      {/* ON label — visible only when the switch is checked, on the left of
          the thumb. Tiny so it never reflows the layout, white on accent
          for contrast. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1 select-none text-[8px] font-bold uppercase tracking-wide text-white opacity-0 transition-opacity duration-150 in-data-checked:opacity-100"
      >
        ON
      </span>
      {/* OFF label — visible only when the switch is unchecked, on the right
          of the thumb. Muted so it doesn't shout. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-1 select-none text-[8px] font-bold uppercase tracking-wide text-primary-700 opacity-100 transition-opacity duration-150 dark:text-neutral-300 in-data-checked:opacity-0"
      >
        OFF
      </span>
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none relative z-10 block aspect-square h-full origin-left in-[[role=switch]:active,[data-slot=label]:active]:not-data-disabled:scale-x-110 in-[[role=switch]:active,[data-slot=label]:active]:rounded-[var(--thumb-size)/calc(var(--thumb-size)*1.1)] rounded-(--thumb-size) bg-white shadow-md will-change-transform [transition:translate_.15s,border-radius_.15s,scale_.1s_.1s,transform-origin_.15s] data-checked:origin-[var(--thumb-size)_50%] data-checked:translate-x-[calc(var(--thumb-size)*1.4-4px)]',
        )}
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
