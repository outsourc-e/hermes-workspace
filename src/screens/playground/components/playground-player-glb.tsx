import { OptionalGlbBody } from './playground-glb-body'

type PlaygroundPlayerGlbProps = {
  avatarId?: string
}

function candidateUrls(avatarId?: string): string[] {
  const id = (avatarId || 'player-adventurer').trim()
  const safe = id.replace(/[^a-z0-9_-]+/gi, '') || 'player-adventurer'
  return [
    `/assets/hermesworld/characters/${safe}.glb`,
    '/assets/hermesworld/characters/player-adventurer.glb',
    `/avatars-3d/${safe}.glb`,
  ]
}

export function PlaygroundPlayerGlb({ avatarId }: PlaygroundPlayerGlbProps) {
  const urls = candidateUrls(avatarId)
  return (
    <>
      {urls.map((url) => (
        <OptionalGlbBody key={url} url={url} scale={0.92} yOffset={0} />
      ))}
    </>
  )
}
