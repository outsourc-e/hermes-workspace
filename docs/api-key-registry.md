# API key registry and rotation checklist

This registry groups supported environment keys so deployments can audit what is configured and rotate keys before a phase graduates.

## Rotation policy

- Treat all prototype keys as temporary.
- Rotate a group when a feature moves from prototype to production, when access is shared with a new operator, or after any suspected leak.
- Prefer provider dashboards or Infisical for storage. Do not commit real values to this repo.
- Keep `.env` values scoped to the minimum deployment that needs them.

## LLM inference

- `ANTHROPIC_API_KEY`
- `NOUS_API_KEY`
- `OPENAI_API_KEY`
- `MINIMAX_API_KEY`
- `OPENROUTER_API_KEY`

## Image generation

- `LEONARDO_API_KEY`
- `LEONARDO_SEED_BLOG`
- `LEONARDO_SEED_EDUCATIONAL`
- `LEONARDO_SEED_POAP`
- `LEONARDO_SEED_PROTOCOL`
- `LEONARDO_SEED_SERIES`
- `KREA_API_TOKEN`
- `FAL_KEY`

## Web3 and on-chain

- `LENS_PRIVATE_KEY`
- `LENS_WALLET_ADDRESS`
- `LENS_PROFILE_ID`
- `LENS_SERVER_API_KEY`
- `GUILD_WALLET_PRIVATE_KEY`
- `GUILD_ID`
- `GUILD_PUBLISHER_ROLE_ID`
- `POAP_API_KEY`
- `POAP_AUTH_TOKEN`
- `POAP_EMAIL`

## Storage and infrastructure

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BACKUP_BUCKET`

## Communication

- `TELEGRAM_BOT_TOKEN`
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `BLUEBUBBLES_PASSWORD`
- `EMAIL_PASSWORD`
- `HERMES_API_TOKEN`

## Integrations and tools

- `OPENCODE_ZEN_API_KEY`
- `SHOPIFY_ACCESS_TOKEN`
- `VAPI_PUBLIC_KEY`
- `VAPI_PRIVATE_KEY`
- `MCP_VAPI_API_KEY`
- `API_SERVER_KEY`
- `HERMES_PASSWORD`

## Platforms and auth

- `INFISICAL_CLIENT_ID`
- `INFISICAL_CLIENT_SECRET`
- `GOOGLE_API_KEY`
- `GOOGLE_AI_STUDIO_API_KEY`

## Verifying configured keys

Run the key doctor to ping each provider's live endpoint and confirm the
configured credential is accepted. Secret values are masked in all output
(only a short fingerprint is printed):

```bash
pnpm keys:check            # diagnostic table, always exits 0
pnpm keys:check -- --json  # machine-readable summary
pnpm keys:check -- --strict # exit 1 if any present key is rejected (401)
```

It reads from the process environment and the local (gitignored) `.env`.
Status legend: `ok` live · `invalid` rejected (401) · `missing` not set ·
`blocked` host denied by network policy / proxy (403) · `error` transport
failure. A `blocked` result means re-run from a host allowed to reach that
provider — it does **not** mean the key is bad. The workspace server itself
reads `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, and `GOOGLE_API_KEY` (provider
usage panel); `ANTHROPIC_API_KEY` and `NOUS_API_KEY` are consumed by the
hermes-agent gateway (`~/.hermes/.env`).

## Operator handoff

When handing off a phase:

1. Export the active key list from the deployment secret store.
2. Compare it against this registry.
3. Rotate keys in the provider dashboard.
4. Update the deployment secret store.
5. Restart Hermes Agent / Workspace services.
6. Re-run provider/model checks in Workspace settings.
