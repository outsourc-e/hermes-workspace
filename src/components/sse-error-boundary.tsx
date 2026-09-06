/**
 * SSE Error Boundary — catches SSE stream failures and shows user-friendly error.
 * Wrap streaming components with <SSEErrorBoundary onError={...}>.
 */
import { Component } from 'react'
import type { ReactElement, ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback?: ReactElement
  onError?: (error: Error) => void
}

type State = { hasError: boolean; error: Error | null }

export class SSEErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-center">
          <div className="text-sm font-medium text-red-400">
            Stream interrupted
          </div>
          <div className="text-xs text-[var(--theme-muted)]">
            The connection dropped. Check your network and try again.
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded border border-red-500/50 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
