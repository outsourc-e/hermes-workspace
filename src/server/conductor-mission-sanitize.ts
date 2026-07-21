const CLOUDFLARE_5XX_MARKERS = [
  /<title>[^<]*\b(?:cloudflare|illuwa\.click)[^<]*\b5\d\d\b[^<]*<\/title>/i,
  /<span[^>]*>\s*Bad gateway\s*<\/span>/i,
  /Error code\s*5\d\d/i,
  /Cloudflare Ray ID\s*:/i,
  /cf-error-details/i,
  /cf-browser-status/i,
  /cf-cloudflare-status/i,
  /cf-host-status/i,
]

const SELF_WORKSPACE_URL_PATTERN =
  /https?:\/\/hermes-workspace\.[^\s<>)"']+(?:\/[^\s<>)"']*)?/gi

export type ConductorGoalSanitization = {
  goal: string
  removedCloudflareErrorPage: boolean
  removedSelfWorkspaceUrls: boolean
  warnings: Array<string>
}

function looksLikeCloudflare5xxPage(value: string): boolean {
  const markerHits = CLOUDFLARE_5XX_MARKERS.reduce(
    (count, marker) => count + (marker.test(value) ? 1 : 0),
    0,
  )
  return /<!doctype html/i.test(value) && markerHits >= 2
}

function stripCloudflare5xxPages(value: string): {
  value: string
  removed: boolean
} {
  if (!looksLikeCloudflare5xxPage(value)) return { value, removed: false }

  const withoutHtmlDocument = value
    .replace(/<!doctype html[\s\S]*?<\/html>/gi, '')
    .replace(/❌\s*$/gm, '')
    .trim()

  return { value: withoutHtmlDocument, removed: true }
}

export function sanitizeConductorMissionGoal(
  rawGoal: string,
): ConductorGoalSanitization {
  const warnings: Array<string> = []
  let goal = rawGoal.trim()

  const cloudflareStripped = stripCloudflare5xxPages(goal)
  goal = cloudflareStripped.value
  if (cloudflareStripped.removed) {
    warnings.push(
      'Removed an embedded Cloudflare 5xx HTML error page from the mission goal.',
    )
  }

  const withoutSelfWorkspaceUrls = goal.replace(
    SELF_WORKSPACE_URL_PATTERN,
    '[workspace public URL removed]',
  )
  const removedSelfWorkspaceUrls = withoutSelfWorkspaceUrls !== goal
  goal = withoutSelfWorkspaceUrls.trim()
  if (removedSelfWorkspaceUrls) {
    warnings.push(
      'Removed public hermes-workspace URL(s) from the mission goal to avoid self-fetching through Cloudflare Access.',
    )
  }

  return {
    goal,
    removedCloudflareErrorPage: cloudflareStripped.removed,
    removedSelfWorkspaceUrls,
    warnings,
  }
}
