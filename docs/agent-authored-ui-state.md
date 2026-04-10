# Agent-authored UI state

Hermes Workspace can render optional structured UI state emitted by the agent instead of relying only on heuristic panel derivation from plain chat text.

## Why

Some side surfaces are more trustworthy when the agent explicitly says what should be surfaced.

This keeps the shell thin:

- the agent decides what deserves screen space
- the client renders it
- heuristic fallback stays only as backup

## Current scope

This first slice supports agent-authored state for:

- chat-side artifact events in the Inspector

If no agent-authored artifact is present, existing UI behavior remains unchanged.

## Notes

- This is intentionally optional and backward-compatible.
- The exact protocol shape can evolve later.
- The shell should prefer agent-authored state when present and fall back conservatively otherwise.
