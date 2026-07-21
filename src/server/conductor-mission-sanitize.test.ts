import { describe, expect, it } from 'vitest'
import { sanitizeConductorMissionGoal } from './conductor-mission-sanitize'

describe('sanitizeConductorMissionGoal', () => {
  it('removes public hermes-workspace self URLs', () => {
    const result = sanitizeConductorMissionGoal(
      'Research this via https://hermes-workspace.illuwa.click/conductor and summarize.',
    )

    expect(result.goal).toBe(
      'Research this via [workspace public URL removed] and summarize.',
    )
    expect(result.removedSelfWorkspaceUrls).toBe(true)
    expect(result.warnings).toContain(
      'Removed public hermes-workspace URL(s) from the mission goal to avoid self-fetching through Cloudflare Access.',
    )
  })

  it('strips embedded Cloudflare 5xx HTML pages', () => {
    const result = sanitizeConductorMissionGoal(`Research: do the thing

<!DOCTYPE html>
<html><head><title>illuwa.click | 502: Bad gateway</title></head>
<body>
<div id="cf-error-details">
<span>Bad gateway</span>
<span>Error code 502</span>
<span>Cloudflare Ray ID: <strong>abc123</strong></span>
<div id="cf-browser-status">Browser Working</div>
<div id="cf-cloudflare-status">Cloudflare Working</div>
<div id="cf-host-status">Host Error</div>
</body></html>`)

    expect(result.goal).toBe('Research: do the thing')
    expect(result.removedCloudflareErrorPage).toBe(true)
    expect(result.goal).not.toContain('<!DOCTYPE html>')
    expect(result.goal).not.toContain('Cloudflare Ray ID')
  })

  it('leaves ordinary goals unchanged', () => {
    const goal =
      'Research functional programming principles and clean-code combinations.'
    const result = sanitizeConductorMissionGoal(goal)

    expect(result.goal).toBe(goal)
    expect(result.removedCloudflareErrorPage).toBe(false)
    expect(result.removedSelfWorkspaceUrls).toBe(false)
    expect(result.warnings).toEqual([])
  })
})
