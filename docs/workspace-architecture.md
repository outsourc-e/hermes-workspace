# Hermes Workspace Architecture

Hermes Workspace is the interface and control layer through which a user can work across multiple environments, tools, agents, and knowledge systems.

The central principle is:

> **Unify the interface, not the domains. Preserve the unknowns.**

## Conceptual Architecture

```text
                              USER
                                │
                           ┌────▼────┐
                           │ HERMES  │
                           │  MAIN   │
                           │INTERFACE│
                           └────┬────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
     ENVIRONMENTS         SHARED INFRASTRUCTURE      AION
          │                     │                     │
     ┌────┴────┐          ┌─────┼─────┐              ?
     ▼         ▼          ▼     ▼     ▼            UNKNOWN
 Research   Art/Creative  Gateway Ollama MCP        ORGANISM
    │           │                  │
    │           │          Obsidian / Zotero /
    │           │              GitHub / etc.
    │           │
 Research     Making
 PhD          Works
 Sources      Experiments
 Questions    Assets
 Experiments  Archive
