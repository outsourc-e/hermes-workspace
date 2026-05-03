import { createFileRoute } from '@tanstack/react-router'
import { Conductor } from '@/screens/gateway/conductor'
import { FeatureNotReady } from '@/components/feature-not-ready'
import { useFeatureCapability } from '@/hooks/use-feature-capability'

function ConductorRoute() {
  const cap = useFeatureCapability('conductor')

  if (cap.loading) return null

  if (!cap.gatewayReachable) {
    return (
      <FeatureNotReady
        feature="Conductor"
        reason="Hermes Agent gateway is not reachable, so Conductor missions can't be dispatched."
        action="Start hermes-agent (see your README) and confirm /api/health responds, then refresh this page."
        learnMoreUrl="https://github.com/outsourc-e/hermes-workspace/issues/262"
      />
    )
  }

  if (!cap.available) {
    return (
      <FeatureNotReady
        feature="Conductor"
        reason="Conductor requires the dashboard's /api/conductor/missions endpoint, which isn't present in your hermes-agent build yet. The rest of the workspace (chat, sessions, skills, memory, jobs) works without it."
        action="Upgrade hermes-agent to a build that ships the Conductor dashboard plugin, or wait for upstream parity."
        learnMoreUrl="https://github.com/outsourc-e/hermes-workspace/issues/262"
      />
    )
  }

  return <Conductor />
}

export const Route = createFileRoute('/conductor')({
  component: ConductorRoute,
})
