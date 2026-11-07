# Server Migration Runbook — Buzz + Twenty (+ optional Hermes)

> **When:** after local validation (owner onboarding done, agents approved, one clean week of night runs).
> **Downtime budget:** ~1–2 h. **Rollback:** old local instances stay frozen 14 days.
> **Prereq:** company server reachable via Tailscale; Docker + Docker Compose installed there.

## 0. Principles

- Single-writer: at cutover, the Mac instance is STOPPED, not deleted, before the server starts.
- Everything already lives in migration-friendly form: host paths (`~/srv/buzz`, `~/twenty`), pinned image tags, env-driven URLs.
- Backups are the migration artifacts. Restore-on-server = migration rehearsal.

## 1. Server preparation

```bash
# on server (once)
sudo mkdir -p /srv/buzz /srv/twenty && sudo chown $USER /srv/{buzz,twenty}
tailscale up                     # join tailnet
```
Note server's Tailscale IP: `tailscale ip -4` → referred to as `$TS_IP`.

## 2. Migrate Buzz relay

```bash
# --- MAC: stop writers, dump ---
launchctl bootout gui/$(id -u)/com.ops.buzz-relay          # stop relay
docker compose -f ~/srv/buzz/docker-compose.yml stop        # freeze infra
docker exec buzz-postgres-1 pg_dump -U buzz -d buzz -Fc -f /tmp/buzz-final.dump
docker cp buzz-postgres-1:/tmp/buzz-final.dump ~/buzz-migration.dump

# also snapshot MinIO media bucket (if any uploads were used)
docker run --rm --network buzz_default -v ~/buzz-media:/backup minio/mc \
  sh -c "mc alias set s http://minio:9000 \$S3_KEY \$S3_SECRET && mc mirror s/buzz-media /backup/"

# --- MAC → SERVER ---
rsync -avz ~/srv/buzz/ server:/srv/buzz/ --exclude target --exclude node_modules
rsync -avz ~/buzz-migration.dump server:/srv/buzz/
rsync -avz ~/srv/buzz/.env server:/srv/buzz/.env   # then EDIT on server (step below)
```

**Edit `/srv/buzz/.env` on the server:**
| Key | Was (Mac) | Becomes (server) |
|---|---|---|
| `BUZZ_BIND_ADDR` | `127.0.0.1:3010` | `0.0.0.0:3010` *(tailnet-exposed only — do NOT port-forward)* |
| `RELAY_URL` | `ws://localhost:3010` | `ws://$TS_IP:3010` |

```bash
# --- SERVER: infra + restore ---
cd /srv/buzz && docker compose up -d postgres redis typesense keycloak minio
sleep 10 && docker compose ps                       # all healthy?
docker exec -i <postgres-container> pg_restore -U buzz -d buzz --clean --if-exists < buzz-migration.dump
./bin/activate-hermit && just build && just relay   # or systemd unit mirroring com.ops.buzz-relay.plist
```

**Verify:** `curl ws handshake 101` from Mac against `ws://$TS_IP:3010`; your identity posts; audit chain intact (`buzz-admin` verify); co-founder joins.

**Register the fleet at Buzz** (owned agent profiles for the 9 Hermes night agents) — see
[buzz-agent-registration.md](./buzz-agent-registration.md) for the NIP-OA tag + click-by-click approval flow.

### Buzz Keycloak — local override (not in upstream compose)

The upstream `docker-compose.yml` defines Keycloak as `start-dev --http-port=8080` with `KC_DB: dev-mem` (in-memory, empty-on-restart). As shipped, that instance 500s on real endpoints and never reports `healthy`. We keep the **upstream compose untouched for git pulls** and put the fixed config in `~/srv/buzz/docker-compose.override.yml`:

- **Durable DB:** keycloak now uses the stack's shared Postgres on a dedicated database:
  `KC_DB=postgres`, `KC_DB_URL=jdbc:postgresql://postgres:5432/keycloak`, `KC_DB_USERNAME=buzz`, `KC_DB_PASSWORD=buzz_dev`. A one-shot `kc-init` companion creates the `keycloak` database (idempotent).
- **Health (both fixes):** `KC_HEALTH_ENABLED=true`, and the healthcheck probes `/health/ready` on the **management port 9000** (keycloak 25+ moved health off :8080).

> ⚠️ **This is a local override file, not part of the upstream repo.** If you redeploy Buzz from upstream elsewhere (fresh clone / new server), you MUST re-apply `docker-compose.override.yml` — the keycloak DB + management-port healthcheck and the MinIO port remap live only there. Without it, keycloak falls back to broken `dev-mem` and reports unhealthy again.

Enable/verify:
```bash
cd ~/srv/buzz && docker compose up -d kc-init keycloak
docker compose ps                      # expect buzz-keycloak ... (healthy)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8180/realms/master/.well-known/openid-configuration   # 200
```

## 3. Migrate Twenty CRM

```bash
# --- MAC ---
cd ~/twenty && docker compose stop                    # freeze prod (staging stays for fallback)
docker exec twenty-db-1 pg_dump -U postgres -d default -Fc -f /tmp/twenty-final.dump
docker cp twenty-db-1:/tmp/twenty-final.dump ~/twenty-migration.dump
rsync -avz ~/twenty/ server:/srv/twenty/ --exclude staging
rsync -avz ~/twenty-migration.dump server:/srv/twenty/

# --- SERVER ---
cd /srv/twenty && docker compose up -d db && sleep 8
docker exec -i $(docker ps -qf name=twenty-db) psql -U postgres -c 'CREATE DATABASE "default";'
cat twenty-migration.dump | docker exec -i $(docker ps -qf name=twenty-db) \
  pg_restore -U postgres -d default --no-owner
docker compose up -d
```

**Edit server `.env`:** `SERVER_URL=http://$TS_IP:3000`. Keep `TAG=v1.23.4` pinned until a planned upgrade.
**Verify:** login works; person count matches last local count (2,958 baseline + delta); API key query OK; then repoint sync jobs (`TWENTY_BASE_URL`).

## 4. Repoint all clients (after both services live)

| Client | Change |
|---|---|
| Buzz Desktop (you) | switch relay to `ws://$TS_IP:3010` |
| Night agents (`ops/secrets/agent-keys.env` consumers) | `BUZZ_RELAY_URL` in `ops/config/buzz.env` |
| Sync scripts / Hermes skills | `TWENTY_BASE_URL=http://$TS_IP:3000` |
| Co-founder | installs Buzz desktop, adds same relay URL, you approve his identity + his agents' keys |
| Optional: Hermes gateway | move later per plan Phase 4; not required for Buzz/Twenty |

## 5. Post-migration checklist

- [ ] Relay audit hash-chain verifies on server
- [ ] One E2E: agent post → your approval reaction → visible in audit export
- [ ] Twenty row-count diff vs pre-cutover dump
- [ ] Backups re-pointed: `ops/bin/twenty-backup.sh` now runs ON the server cron; offsite copy configured
- [ ] Mac launchd jobs `com.ops.buzz-relay`, `com.ops.twenty-backup` bootout-ed (agents keep running locally until Hermes moves)
- [ ] Old Mac volumes kept frozen 14 days, then deleted
- [ ] Update `docs/ops/port-registry.md` with server layout

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Split-brain double writes during cutover | Mac instances stopped BEFORE server starts (single-writer rule) |
| Data loss in transit | checksum dumps (`shasum -a 256` before rsync, verify after); frozen originals 14 days |
| Client breakage from URL change | Tailscale IP is stable; port registry updated first; env-driven clients need one edit each |
| Relay exposed accidentally | bind 0.0.0.0 ONLY inside tailnet host; never port-forward on router; Keycloak/Adminer ports NOT exposed publicly |
