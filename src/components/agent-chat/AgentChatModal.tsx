import { AgentChatHeader } from './AgentChatHeader'
import { DialogContent, DialogRoot } from '@/components/ui/dialog'

type AgentChatModalProps = {
  open: boolean
  /** Legacy transport identity is intentionally ignored. */
  sessionKey: string
  agentName: string
  statusLabel: string
  onOpenChange: (open: boolean) => void
}

/**
 * The former agent transcript modal used raw session history and send routes.
 * Agent activity can now be opened only through the owning Session Card from
 * Agent View. Keep this legacy export fail-closed for any dormant callers.
 */
export function AgentChatModal({
  open,
  sessionKey: _sessionKey,
  agentName,
  statusLabel,
  onOpenChange,
}: AgentChatModalProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(520px,94vw)] overflow-hidden rounded-3xl border border-primary-300/70 bg-primary-100/90 p-0 backdrop-blur-xl z-50">
        <AgentChatHeader
          agentName={agentName}
          statusLabel={statusLabel}
          isDemoMode={false}
          onClose={() => onOpenChange(false)}
        />
        <section className="p-6" aria-labelledby="agent-chat-unavailable-title">
          <h2
            id="agent-chat-unavailable-title"
            className="text-sm font-semibold text-primary-900"
          >
            Agent chat unavailable
          </h2>
          <p className="mt-2 text-sm text-primary-600">
            Raw agent transcripts and direct sends are no longer available. Open
            this activity from its validated parent Session Card instead.
          </p>
        </section>
      </DialogContent>
    </DialogRoot>
  )
}
