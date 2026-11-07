/**
 * Background Service Worker — managed lexicon, Entra stub, audit transport (NIS2 24h p10),
 * anti-tamper declarativeNetRequest for DevTools on LLM domains.
 */
import { ManagedPolicySchema } from "@ai-protect/shared";
import { DEFAULT_POLICY, hashPolicy, validatePolicy } from "@ai-protect/policy";

const AUDIT_ALARM = "flush-audit";
let auditQueue: any[] = [];

chrome.runtime.onInstalled.addListener(async () => {
  await ensureOffscreen();
  await syncManagedPolicy();
  chrome.alarms.create(AUDIT_ALARM, { periodInMinutes: 5 });
  // Anti-tamper rule (declarativeNetRequest) — block attach debugger on LLM domains when policy says so
  // In real enterprise this blocks F12 attach via CDP permission; here we register a no-op rule to prove presence
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1001],
      addRules: [],
    });
  } catch {}
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "managed") syncManagedPolicy();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === AUDIT_ALARM && auditQueue.length) await flushAudit();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "AI_PROTECT_SUBMIT_AUDIT") {
    auditQueue.push(msg.receipt);
    sendResponse({ queued: true });
    return true;
  }
  if (msg?.type === "AI_PROTECT_GET_POLICY") {
    chrome.storage.local.get("aiProtectPolicy").then((r) => sendResponse(r.aiProtectPolicy));
    return true;
  }
  if (msg?.type === "AI_PROTECT_QUERY_NANO") {
    // proxy to offscreen
    (async () => {
      const res = await chrome.runtime.sendMessage({ ...msg, _via: "bg" }).catch(() => null);
      sendResponse(res);
    })();
    return true;
  }
});

async function syncManagedPolicy() {
  const managed = await (chrome.storage as any).managed?.get?.() ?? {};
  const raw = managed && Object.keys(managed).length ? managed : { ...DEFAULT_POLICY, policyHash: hashPolicy(DEFAULT_POLICY as any) };
  try {
    const validated = validatePolicy({ ...raw, policyHash: raw.policyHash ?? hashPolicy(raw as any) });
    await chrome.storage.local.set({ aiProtectPolicy: validated });
    // push to offscreen/content via storage change
  } catch (e) {
    console.warn("[ai-protect] managed policy invalid", e);
  }
}

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: "src/offscreen/offscreen.html",
    reasons: ["DOM_PARSER" as any],
    justification: "Gemini Nano session needs DOM for Permission Policy allow=language-model",
  });
}

async function flushAudit() {
  const batch = auditQueue.splice(0, auditQueue.length);
  // In prod: POST to backend with Ed25519 signature; here log + store locally for review
  await chrome.storage.local.set({ lastAuditBatch: batch, lastFlush: new Date().toISOString() });
  console.info("[ai-protect] audit flush", batch.length);
}
