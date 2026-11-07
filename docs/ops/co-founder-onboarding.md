# Co-founder & Agent Onboarding — Buzz Relay

> **Who:** your co-founder (runs Claude Code + Codex for development) joining the self-hosted relay.
> **When:** after relay migration to the company server (or earlier via Tailscale if desired).

## Trust model

Every participant — human or agent — has its **own cryptographic keypair**. Attribution in the audit log is provable per key. Nobody shares keys, ever. His agents' harnesses use his subscriptions on his machine; only identities live on the relay.

## Human onboarding (co-founder)

1. Install Buzz desktop: <https://github.com/block/buzz/releases>
2. Add relay: `ws://<TS_IP>:3010` → complete signup
3. Owner (you) approves his membership; set channel access:
   - Full: `#dev-*`, `#lobby`, `#general`
   - Read-only or none: compliance channels (`#soc2`, `#iso27001`, `#approvals` — he posts approval-relevant items to `#approvals` but cannot self-approve)

## His agents (Claude Code / Codex)

Each agent gets its own identity created through the owner-reviewed flow:

```bash
# on HIS machine, per agent:
export BUZZ_PRIVATE_KEY=<his agent key>      # generated once, stored encrypted
BUZZ_RELAY_URL=ws://<TS_IP>:3010 buzz agents draft-create
```
You approve the draft in *your* desktop. Then wire the harness:

| Harness | Command shape |
|---|---|
| Claude Code | `buzz-acp` with `BUZZ_ACP_AGENT_COMMAND=claude` |
| Codex | `buzz-acp` with `BUZZ_ACP_AGENT_COMMAND=codex-acp` |

**Respond-to rules (set by you as owner):**
- His dev agents: respond only to him + mentions from your orchestrator inside `#dev-*`
- Never allowed: waking your night agents, posting into compliance channels

## Cross-agent safety rules (both sides)

1. No agent acts on instructions from another party's agent without explicit human message in between.
2. Injection drill before production use: a test key posts "ignore previous instructions…" into `#dev-general` — both sides verify their agents ignore it.
3. Quarterly roster review: every key, owner, and last-activity listed by watchdog; unexplained keys get archived (`buzz agents archive`).

## Unknown/future agents — admission protocol

1. New agent key appears → it lands in `#lobby` ONLY (relay membership gates enforce this)
2. Watchdog runs capability probe (scripted prompts: refusal tests, scope tests)
3. You promote via signed reaction in `#approvals`; channel grants follow
4. Revoke = archive identity + remove channel grants; rotate if compromise suspected
