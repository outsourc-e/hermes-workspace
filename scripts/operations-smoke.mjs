// operations-smoke.mjs — B5 operations smoke without a browser.
// Hits the live workspace (:3001, launchd) and asserts the integration chain
// behind /operations: page serves, gateway zero-fork, profiles non-empty,
// cron proxy answers. Browser E2E (Playwright) is pending @playwright/test.
// Usage: pnpm smoke:operations  (exit 0 all green)
const BASE = process.env.WORKSPACE_URL || "http://127.0.0.1:3001";
let fail = 0;
const ok = (name) => console.log(`PASS ${name}`);
const bad = (name, detail) => {
  fail++;
  console.log(`FAIL ${name} (${detail})`);
};

const page = await fetch(`${BASE}/operations`).catch((e) => null);
if (page?.ok) ok("operations page serves 200");
else bad("operations page serves 200", "workspace :3001 down?");

try {
  const gs = await (await fetch(`${BASE}/api/gateway-status`)).json();
  gs.mode === "zero-fork" && gs.gateway?.available
    ? ok("gateway-status zero-fork")
    : bad("gateway-status zero-fork", JSON.stringify(gs).slice(0, 120));
} catch (e) {
  bad("gateway-status zero-fork", String(e).slice(0, 100));
}

try {
  const pl = await (await fetch(`${BASE}/api/profiles/list`)).json();
  Array.isArray(pl.profiles) && pl.profiles.length > 0
    ? ok(`profiles list non-empty (${pl.profiles.length})`)
    : bad("profiles list non-empty", JSON.stringify(pl).slice(0, 120));
} catch (e) {
  bad("profiles list non-empty", String(e).slice(0, 100));
}

try {
  const cj = await fetch(`${BASE}/api/hermes-jobs`);
  cj.ok ? ok("hermes-jobs proxy answers") : bad("hermes-jobs proxy answers", `HTTP ${cj.status}`);
} catch (e) {
  bad("hermes-jobs proxy answers", String(e).slice(0, 100));
}

console.log(fail === 0 ? "SMOKE PASS" : `SMOKE FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
