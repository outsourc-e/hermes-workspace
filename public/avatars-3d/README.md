# 3D NPC bodies (optional GLB swap)

Drop GLB models named after each NPC id and they'll replace the voxel body
in the Playground. The portrait-chip nameplate stays the same.

## Recognized NPC ids

`athena`, `apollo`, `iris`, `nike`, `pan`, `chronos`, `hermes`, `eros`

Plus: `tavernkeeper`, `banker`, `trainer`, `innkeeper`, `apothecary`, `recruiter`, `shopkeeper`

## Generation pipeline

1. Open https://www.meshy.ai/ (free tier: 200 credits/mo, ~15 generations).
2. Use **Text-to-3D**.
3. Suggested prompts:
   - `athena.glb` — "Greek goddess Athena, owl helmet, robed, holding a scroll, stylized low-poly game character, T-pose, full body, neutral lighting"
   - `apollo.glb` — "Greek god Apollo, laurel crown, holding a lyre, golden robe, stylized low-poly game character, T-pose, full body"
   - `iris.glb` — "Greek goddess Iris with rainbow-colored wings, courier outfit, stylized low-poly game character, T-pose, full body"
   - `nike.glb` — "Greek goddess Nike of victory, winged warrior, bronze armor, stylized low-poly game character, T-pose, full body"
   - `pan.glb` — "Greek god Pan, satyr legs, panpipes, leather smith apron, stylized low-poly game character, T-pose, full body"
   - `chronos.glb` — "Personification of time as a Greek archivist, hourglass robe, long beard, stylized low-poly game character, T-pose, full body"
   - `hermes.glb` — "Greek god Hermes, winged sandals, winged helmet, caduceus, traveler robe, stylized low-poly game character, T-pose, full body"
   - `eros.glb` — "Greek god Eros as an apothecary, bow on back, robe with vials, stylized low-poly game character, T-pose, full body"
4. Refine to a "Stylized" or "Realistic" art style — pick whichever looks
   most consistent across the set. Recommend the *same* style for all 8.
5. Download → "Download Model" → GLB format, 8K texture is fine.
6. Drop into `public/avatars-3d/<id>.glb`. Reload the page.

## Sizing & alignment

The voxel body is about 1.6u tall, feet at y=0. If your GLB lands too tall
or floating, edit the `<PlaygroundNpcGlb scale={...} yOffset={...}>` call
inside `playground-world-3d.tsx`. Default `scale=1, yOffset=0`. Most
Meshy/Tripo GLBs come pre-scaled close to 1.6m.

## Performance budget

- Keep each GLB under 2 MB compressed (gzip).
- Triangle budget ~10k per character is fine; more is wasteful.
- Avoid 4K textures — 1024 or 2048 max.

If a GLB is missing, the voxel body shows automatically — no errors,
no broken state. Mix-and-match is fine (only have Athena's GLB? Just
Athena gets the upgrade).
