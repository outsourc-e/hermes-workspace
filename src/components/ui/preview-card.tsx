'use client'

import { PreviewCard as PreviewCardPrimitive } from '@base-ui/react/preview-card'
import { cn } from '@/lib/utils'

const PreviewCard = PreviewCardPrimitive.Root

type PreviewCardTriggerProps = React.ComponentProps<
  typeof PreviewCardPrimitive.Trigger
>

function PreviewCardTrigger({ className, ...props }: PreviewCardTriggerProps) {
  return (
    <PreviewCardPrimitive.Trigger
      className={cn(className)}
      data-slot="preview-card-trigger"
      {...props}
    />
  )
}

type PreviewCardPopupProps = PreviewCardPrimitive.Popup.Props & {
  align?: PreviewCardPrimitive.Positioner.Props['align']
  sideOffset?: PreviewCardPrimitive.Positioner.Props['sideOffset']
}

function PreviewCardPopup({
  className,
  children,
  align = 'center',
  sideOffset = 6,
  ...props
}: PreviewCardPopupProps) {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        align={align}
        className="z-50"
        data-slot="preview-card-positioner"
        sideOffset={sideOffset}
      >
        <PreviewCardPrimitive.Popup
          className={cn(
            'relative w-64 origin-(--transform-origin) rounded-lg p-3 text-sm text-pretty outline shadow-2xs',
            className,
          )}
          data-slot="preview-card-content"
          style={{
            background: 'var(--theme-card)',
            color: 'var(--theme-text)',
            outlineColor: 'var(--theme-border)',
          }}
          {...props}
        >
          {children}
        </PreviewCardPrimitive.Popup>
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )
}

export {
  PreviewCard,
  PreviewCard as HoverCard,
  PreviewCardTrigger,
  PreviewCardTrigger as HoverCardTrigger,
  PreviewCardPopup,
  PreviewCardPopup as HoverCardContent,
}
