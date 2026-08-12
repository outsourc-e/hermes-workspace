'use client'

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogRoot,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type SessionDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionTitle: string
  mode?: 'delete' | 'archive'
  onConfirm: () => void
  onCancel: () => void
}

export function SessionDeleteDialog({
  open,
  onOpenChange,
  sessionTitle,
  mode = 'delete',
  onConfirm,
  onCancel,
}: SessionDeleteDialogProps) {
  return (
    <AlertDialogRoot open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <div className="p-4">
          <AlertDialogTitle className="mb-1">
            {mode === 'archive' ? 'Archive Card' : 'Delete Session'}
          </AlertDialogTitle>
          <AlertDialogDescription className="mb-4">
            {mode === 'archive'
              ? `Archive “${sessionTitle}”? Its transcript remains available to the server, but the card will leave the active conversation list.`
              : `Are you sure you want to delete “${sessionTitle}”? This action cannot be undone.`}
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>
              {mode === 'archive' ? 'Archive' : 'Delete'}
            </AlertDialogAction>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialogRoot>
  )
}
