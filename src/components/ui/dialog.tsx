'use client'

import { Dialog } from '@base-ui/react/dialog'
import { Button } from './button'
import { cn } from '@/lib/utils'

type DialogRootProps = React.ComponentProps<typeof Dialog.Root>

function DialogRoot({ children, ...props }: DialogRootProps) {
  return <Dialog.Root {...props}>{children}</Dialog.Root>
}

type DialogTriggerProps = React.ComponentProps<typeof Dialog.Trigger>

function DialogTrigger({ className, ...props }: DialogTriggerProps) {
  return <Dialog.Trigger className={cn(className)} {...props} />
}

type DialogContentProps = {
  className?: string
  children: React.ReactNode
  style?: React.CSSProperties
}

function DialogContent({ className, children, style }: DialogContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop
        className="fixed inset-0 transition-all duration-150 data-[state=open]:opacity-100 data-[state=closed]:opacity-0"
        style={{ background: 'rgba(0,0,0,0.5)' }}
      />
      <Dialog.Popup
        className={cn(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          'w-[min(400px,92vw)] max-h-[90vh] rounded-[10px] p-0 overflow-hidden flex flex-col',
          'transition-all duration-150',
          'data-[state=open]:opacity-100 data-[state=closed]:opacity-0',
          'data-[state=open]:scale-100 data-[state=closed]:scale-95',
          className,
        )}
        style={{
          background: 'var(--theme-panel)',
          border: '1px solid var(--theme-border)',
          boxShadow: 'var(--theme-shadow-3)',
          color: 'var(--theme-text)',
          ...style,
        }}
      >
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  )
}

type DialogTitleProps = React.ComponentProps<typeof Dialog.Title>

function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <Dialog.Title
      className={cn('text-lg font-medium', className)}
      style={{ color: 'var(--theme-text)' }}
      {...props}
    />
  )
}

type DialogDescriptionProps = React.ComponentProps<typeof Dialog.Description>

function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <Dialog.Description
      className={cn('text-sm', className)}
      style={{ color: 'var(--theme-muted)' }}
      {...props}
    />
  )
}

type DialogCloseProps = React.ComponentProps<typeof Dialog.Close> & {
  render?: React.ReactElement
}

function DialogClose({ className, render, ...props }: DialogCloseProps) {
  return (
    <Dialog.Close
      render={render || <Button variant="outline" className={cn(className)} />}
      {...props}
    />
  )
}

export {
  DialogRoot,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
}
