# Memory Galaxy — dust-forward redesign (approved 2026-07-10)

Taylor-approved design from visual brainstorm (demos in
`.superpowers/brainstorm/*/content/galaxy-*.html`; reference look =
`galaxy-dust-forward.html`).

## Look (locked)
Hybrid of true spiral galaxy + living nebula clusters, **dust-forward**:
- 3-arm logarithmic spiral of additive dust points (~19k), amber-white core →
  neon-blue arms → deep-blue rim, slow rotation (~110s/rev), camera tilt ~32°,
  mouse-parallax tilt.
- Topic clusters (vault folders) = faint colored nebula regions *inside* the
  dust (low-opacity soft sprites; hues from the cluster palette: neon blues +
  one amber + blends). Never clouds pasted on top.
- Notes = ember points inside their cluster region, cluster-tinted.
- Hubs (high degree) = larger amber embers with slow pulse.
- Orphans (degree 0) = comets drifting the rim (kept from current model).
- Faint neon-blue filaments cluster-centers → core; soft amber core glow.
- Palette canon: deep navy space (#030710–#0A1424), neon blues (#63C7FF,
  #9DDCFF, #2E7FD9), ambers (#FF8C1A, #FFB347, #FFD27A). No purple, no green.

## Wayfinding (locked, 5 layers)
1. **Constellation names always on** — cluster labels anchored at cluster
   centers, softly visible zoomed out, fade as camera closes in.
2. **Hover = identify** — nearest ember shows title chip; its wikilink edges
   flare neon-blue to connected notes.
3. **Click = go & read** — camera glides to the star; top hub labels appear in
   that cluster; side panel shows the real note body + clickable backlinks
   (reuses existing `/api/knowledge/read` wiring — no fake data).
4. **Search = jump** — search box over `/api/knowledge/search`; picking a
   result flies the camera to that star and lights its links.
5. **Meaning in visuals + legend** — color=cluster, size=degree, amber
   pulse=hub, brightness=recently modified (this week glows), comets=orphans;
   corner legend chip; filters: by cluster/folder and "this week" recency.

## Data contract (unchanged)
`/api/knowledge/graph` nodes/edges are the only source. Every real note is
represented exactly once and none invented (existing tested invariant stays).
Folder → cluster assignment; degree computed from edges; `modified` drives
recency brightness.

## Performance budget (hard)
One canvas/renderer; ≤25k points total; nebula sprites ≤90; pixelRatio ≤1.5;
`powerPreference: 'low-power'`; RAF fully stops on `document.hidden` and when
the card is offscreen (IntersectionObserver); `prefers-reduced-motion` freezes
rotation/pulse. (Budget exists because the 3-demo mockup page contributed to a
RAM incident on 2026-07-10.)

## Cockpit chrome + layout (added 2026-07-10, Taylor via Nova — binding)
- **Chrome ban list:** no purple cards, no green brand chips, no cyan
  borders/glows as *chrome*. Card surfaces, borders, buttons, chips, labels =
  **navy + amber only**. Neon blues remain canon **inside the galaxy render
  and data-glow accents**, never as card chrome.
- **Shell vs cockpit boundary:** the Hermes shell may stay Hermes-branded;
  everything inside the Mission Control dashboard surface is Nova navy/amber.
  No mixed skin inside the cockpit.
- **Galaxy is the hero:** on desktop the galaxy field renders tall
  (~70vh, not a ~350px strip).
- **Density:** kill the dead space under the galaxy; tighten the card grid —
  denser cockpit, no "empty parking lot".
- **Card hierarchy:** primary ops cards (Galaxy, Live Systems, Taylor
  Approvals, Session Bridge) visually prominent; decorative/low-value cards
  quieter and more compact.
- **Desktop first:** do not spend this pass on mobile polish.
- **Status semantics in chrome:** healthy = gold, attention/needs-Taylor =
  amber, danger = warm red-amber; distinction also by brightness/shape, never
  by green.
- **Tripwire:** a unit test fails the build if cockpit chrome tokens resolve
  to green/purple/cyan hues, so merges can't silently steal the skin again.

## Non-goals
- No physics engine, no VR, no server changes beyond what exists.
- No new colors outside the canon palette.
- Galaxy polish never blocks or regresses the note-read/insights wiring.

## Acceptance
- Matches the dust-forward demo side-by-side (screenshot design gate, ≥2
  iteration rounds).
- All 5 wayfinding layers work against the real vault (396+ notes).
- Existing galaxy-model tests still pass; new tests for cluster assignment,
  recency-brightness mapping, and search→fly selection logic.
- Budget respected (verified via frame profile + heap sanity check).
