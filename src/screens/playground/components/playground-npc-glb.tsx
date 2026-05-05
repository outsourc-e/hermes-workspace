/**
 * Optional GLB-based NPC body.
 *
 * Canonical path is now `/assets/hermesworld/characters/<id>.glb`.
 * Legacy `/avatars-3d/<id>.glb` is still probed as a fallback.
 */

import { OptionalGlbBody } from './playground-glb-body'

type PlaygroundNpcGlbProps = {
  avatar?: string
}

function candidateUrls(avatar?: string): string[] {
  const id = (avatar || 'villager-common').trim()
  const safe = id.replace(/[^a-z0-9_-]+/gi, '') || 'villager-common'
  return [
    `/assets/hermesworld/characters/${safe}.glb`,
    `/avatars-3d/${safe}.glb`,
  ]
}

export function PlaygroundNpcGlb({ avatar }: PlaygroundNpcGlbProps) {
  const urls = candidateUrls(avatar)
  return (
    <>
      {urls.map((url) => (
        <OptionalGlbBody key={url} url={url} scale={0.95} yOffset={0} />
      ))}
    </>
  )
}
