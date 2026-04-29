# Swarm2 FrankenGPU-7777 Control Plane Brief

## Product intent

Swarm2 should read as Operations powered by swarm agents: Aurora is the visible routing hub, workers are operational cards wired into that hub, and the bottom router chat remains the orchestration brain. The topology should clarify coordination, not replace the cards.

## Default landing structure

1. Header / mode controls
   - Keep `/swarm2` separate from current `/swarm`.
   - Default mode is `Control plane` / cards topology.
   - Runtime / tmux is an explicit secondary mode, never the first surface.

2. Primary Aurora hub
   - A large top-center orchestrator card labeled Aurora / Orchestrator.
   - Shows aggregate operational state: online workers, room/wired count, auth health, selected worker.
   - Contains routing affordance to open the bottom router chat.
   - Visually stronger than any worker card.

3. Wiring layer
   - Visible SVG/CSS connection lines run from Aurora down into the worker field.
   - Lines are subdued by default, highlighted for room members and the selected worker.
   - Wires reinforce routing paths; they do not become the main interaction model.

4. Worker node cards
   - Cards remain the operational surface.
   - Each worker card must continue to show role, state, current task, latest useful signal, and direct actions.
   - Cards arrange beneath/around Aurora in a centered node field rather than a generic masonry/card page.
   - Direct affordances remain: focus/select, add/remove from room, tasks/router action, terminal/runtime action.

5. Bottom router chat
   - Stays bottom-center and dockable.
   - It represents the active orchestration brain for manual/broadcast dispatch.
   - Cards and Aurora card open/focus it, but it does not replace worker cards.

6. Runtime/tmux
   - Stays a separate mode.
   - Runtime mode can still use selected worker or wired room targets.
   - Do not let terminal panes dominate the default landing surface.

## Current implementation pass

- Replace the compact horizontal topology strip as the main visual metaphor with a control-plane stage.
- Add an Aurora card centered above worker cards.
- Render a visible wiring SVG behind the worker stage with deterministic lines from the hub to each worker card slot.
- Keep AgentCard intact so operational details and actions remain real.
- Keep the existing AttentionRail as a secondary status sidebar, not the main surface.

## Guardrails

- No placeholder/filler copy.
- No decorative-only cards that hide operational state.
- Avoid current-Swarm clutter: no dense rails of unrelated widgets, no default terminal wall.
- Preserve `/swarm` stability; change only `/swarm2` and shared components already introduced for swarm2.

## Remaining target after this pass

- Measure actual DOM positions for precise Bezier wires instead of slot-based layout lines.
- Add route activity animation from Aurora to workers during dispatch/results.
- Let workers cluster by role/lane while keeping cards full-size.
- Surface queue/dispatch outcomes on the Aurora hub.
- Add visual room presets without turning the surface into a graph editor.
