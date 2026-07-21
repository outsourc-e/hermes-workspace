# Olympus War Room vNext Asset Coverage

This build uses a generated asset set for every playable room:

- **Rooms:** every room has a generated room background asset under `public/war-room/vNext/rooms/...` or the Forge layered base under `public/war-room/vNext/forge/layers/...`.
- **Tools/stations:** every station has its own generated transparent PNG prop asset referenced in `src/screens/war-room/game/scene-manifest.ts`.
- **Models/agents:** every room agent has a generated walking model sprite/gif. Hephaestus additionally uses the premium Forge mini-sheet for the professional four-frame walk cycle.
- **Window card:** the popup uses the generated Forge stone/gold frame asset plus a responsive in-game HUD layer: close control, station prop pedestal, AI flow diagram, status cards, allowed/locked chips.

Asset verification on this pass: all manifest-referenced `/war-room/...` files exist on disk. Missing asset count: 0.

Current standard:
1. No CSS-only placeholder tools.
2. No debug numbered markers.
3. Models move autonomously and tool-click movement starts from current position.
4. Tool clicks open the station window immediately.
5. Popup text must fit inside the card at desktop and stay away from the close socket.
6. Popup content must include themed visual structure, not only plain text.
