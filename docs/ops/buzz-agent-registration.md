# Buzz Agent Registration — NIP-OA Owner Attestation (click-by-click)

> Procedure for creating **owned agent profiles** at the Buzz relay for every Hermes night agent
> (orchestrator, competitor-scout, customer-watcher, partner-radar, product-intel, chief-of-staff,
> watchdog, crm-sync, doc-agent).
>
> Companion: [`ops/bin/buzz-register-agents.sh`](../../ops/bin/buzz-register-agents.sh) ·
> [`server-migration-runbook.md`](./server-migration-runbook.md) · NIP-OA spec: `~/srv/buzz/docs/nips/NIP-OA.md`

## What "registration" actually is

Run `ops/bin/buzz-register-agents.sh` and it will report all 10 agents as **`prepared`** but **not
registered**. (Earlier revisions of this doc say 9 — `fleet-health-monitor` was added later.) That is correct — nothing is broken. "Registration" here does **not** mean "upload a
profile." It means:

1. The script validates connectivity, condenses each agent's system prompt, resolves each agent's
   home channel UUID, and checks whether an **owned agent profile already exists** (`buzz users get --name X --owner me`).
2. If none exists, it calls `buzz agents draft-create`, which **opens a prefilled create-agent form
   in the Buzz Desktop** for you (the owner) to review and approve.
3. `draft-create` requires a `BUZZ_AUTH_TAG` — a **NIP-OA owner attestation** proving your key
   authorized that agent key. This step is deliberately **not fully scriptable**: it needs your
   signature. So the script stops short and tells you exactly what to supply.

Right now `exists=0` for all 9 → you need to run the flow below **once** to create the 9 profiles.

## What a NIP-OA tag is (short version)

A NIP-OA tag is a JSON array that says *"the owner key (O) authorizes the agent key (A) to act."*

```json
["auth", "<owner-pubkey-hex>", "<conditions>", "<sig-hex>"]
```

- `<owner-pubkey-hex>` — your 64-hex-char public key.
- `<conditions>` — an optional restriction string (e.g. `kind=1&created_at<1760000000`). The empty string `""` means **no bound**.
- `<sig-hex>` — a **BIP-340 Schnorr signature by your owner secret key** over `SHA256("nostr:agent-auth:" + agent_pubkey + ":" + conditions)`.

`BUZZ_AUTH_TAG` is this tag as JSON. The **agent being authorized is the one running `draft-create`** —
for our fleet that is the `orchestrator` identity (pubkey `f4e3cc091edcadf4ac0e5a36e1d996f643f7d4c9a1993daeed59977d8326687f`).
So the tag is: **signed by you (owner), authorizing the orchestrator key.**

---

## Part A — get your owner key ID (2 minutes)

Your owner identity is the "coin-base"/sign-in account used in the **Buzz Desktop** app's key backup.
Only its **public** half matters for building the tag; know where your private half is held so you
can sign with it below.

1. Open **Buzz Desktop**.
2. Go to **Settings → Backup test / Private key backup** (the onboarding "Backup flow" also shows it).
   Your identity is an **nsec** (private) keypair on your machine. The app shows the **pubkey** — make
   a note of that 64‑char hex (that is `owner-pubkey-hex`).
3. You need the **private half** to sign. If you imported an nsec during onboarding, that value is what
   you sign with. Keep it **private** (never commit it — `ops/secrets/` is gitignored).

> You already hold the owner key; the Desktop app just uses it to sign. To *build a NIP‑OA tag* we need
> to run a tiny signing step with that owner secret — see Part C.

## Part B — what the tag authorizes (do once)

The tag authorizes the **orchestrator** agent key (`BUZZ_PRIVATE_KEY="$KEY_orchestrator"` in
`ops/secrets/agent-keys.env`). Its pubkey is:

```
f4e3cc091edcadf4ac0e5a36e1d996f643f7d4c9a1993daeed59977d8326687f
```

You can re-verify it any time (from the private key, secp256k1 x-only derivation) — but you do not
change it here. The tag is bound to **this** agent pubkey.

## Part C — generate the tag (click-by-click)

Pick one of the two generators (both produce identical JSON). Use the **empty conditions** string
(`""`) unless you specifically want a `kind=` / `created_at<` bound.

### Option 1 — use the SDK example (recommended, runs in ~/srv/buzz)

Open a terminal **in `~/srv/buzz`** and run:

```bash
cargo run --release --example compute_auth_tag -- \
  '<YOUR_OWNER_SECRET_HEX>' \
  f4e3cc091edcadf4ac0e5a36e1d996f643f7d4c9a1993daeed59977d8326687f \
  ''
```

It prints a single line of JSON, e.g.:
```json
["auth","<your-owner-pubkey>","","<64-byte-signature-hex>"]
```

Copy that whole JSON **including the square brackets**.

> **Why Option 1 is the only recommended path.** NIP-OA signing uses BIP-340 Schnorr with a
> deterministic nonce (RFC 6979-style + `aux_rand`). The nonce derivation is subtle and closely
> coupled to the same `secp256k1` crate the relay uses to verify (`buzz_sdk::nip_oa::verify_auth_tag`
> → `SECP256K1.verify_schnorr`). The SDK's `compute_auth_tag` is the single authoritative signer
> in this codebase; its unit tests (`test_sign_then_verify_round_trip`, `test_verify_spec_test_vector`)
> confirm the sign path produces tags that pass the relay's canonical verifier. Standalone BIP-340
> reimplementations frequently get the nonce wrong and produce signatures the relay silently rejects —
> the Python snippets in `scripts/e2e-git-perms.sh` use a labelled "TEST ONLY" nonce and are not
> relay-accepted outside of the local dev-relay trust zone. Use the SDK.
>
> You can independently verify the SDK signer/verifier are consistent:
> ```bash
> cd ~/srv/buzz && source ./bin/activate-hermit
> cargo test -p buzz-sdk --lib nip_oa   # all 22 tests must pass
> ```

## Part D — register the 9 agents (apply)

Now hand the tag to the registration script. Either **one-shot** (env var, nothing written to disk):

```bash
export BUZZ_AUTH_TAG='["auth","<your-owner-pubkey>","","<sig-hex>"]'    # the JSON from Part C
ops/bin/buzz-register-agents.sh
```

or **persist it** (file is gitignored):
```bash
printf "BUZZ_AUTH_TAG=%s\n" '["auth","<your-owner-pubkey>","","<sig-hex>"]' > ops/secrets/buzz-auth-tag.env
ops/bin/buzz-register-agents.sh
```

The script will now print `-> form opened: <name>  (approve it in Buzz Desktop)` for each agent.

## Part E — approve the forms in Buzz Desktop (owner, click-by-click)

For each of the 9 agents, the Desktop should surface a pending **agent application / create-agent
form**. Approving them authorizes the new owned profile:

1. In **Buzz Desktop**, look for a **notification / requests / agents** affordance for a new
   **agent application** (the fleet here registers as the orchestrator, so it arrives as an agent
   create request).
2. Open the request and review the prefilled **display name**, **home channel**, and **system prompt**
   (these came from `ops/agents/<name>.md` / the script — names are byte-identical to the source of truth).
3. Click **Approve** (you may be asked to confirm your owner key / presence).
4. Repeat for all 9: `orchestrator`, `competitor-scout`, `customer-watcher`, `partner-radar`,
   `product-intel`, `chief-of-staff`, `watchdog`, `crm-sync`, `doc-agent`.
5. (Optional) reject & re-run is safe — the script is idempotent, so a partial approval converges.

## Part F — verify convergence

Re-run the checker (no tag needed — it only checks ownership):

```bash
ops/bin/buzz-register-agents.sh
```

Expect: `exists=9 opened=0 prepared=0 failed=0`. If any read `exists=0`, those forms were not yet
approved — approve them and re-run.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `exists=0` always | Forms not approved yet (Part E), or the tag authorized the wrong agent pubkey (Part B/C: must be the orchestrator key). |
| `FAIL draft-create` | Auth tag invalid/stale, or Desktop not running. Re-generate the tag (owner still must be a signed-in member of the relay) and retry. |
| `BUZZ_AUTH_TAG is set — it may be stale` (403) | The old tag is rejected by the relay. `unset BUZZ_AUTH_TAG`, regenerate with a fresh signature (created_at bound if you used one), retry. |
| Tag is rejected at verification | Signature owner pubkey (element 0) ≠ the key that signed; or `<conditions>` got whitespace; or agent pubkey in the preimage ≠ signing key. Regenerate carefully (no spaces in conditions). |
| Don't know what the tag is authorizing | Read NIP-OA §The Tag at `~/srv/buzz/docs/nips/NIP-OA.md`; the preimage always binds the **signing agent key**, not the owner key. |