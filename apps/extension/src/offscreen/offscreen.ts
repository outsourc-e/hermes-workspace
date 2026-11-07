import { checkAvailability, createSession, detectWithNano } from "@ai-protect/nano";
import { substituteExact } from "@ai-protect/core";

let session: any = null;

async function ensureSession(lexicon: any) {
  const avail = await checkAvailability({ expectedLanguages: ["de", "en"], lexicon });
  if (avail !== "available" && avail !== "downloadable" && avail !== "downloading") return null;
  if (!session) session = await createSession({ lexicon }, (p) => console.info("[ai-protect offscreen] download", p));
  // contextoverflow guard
  session?.addEventListener?.("contextoverflow", () => {
    console.warn("[ai-protect] contextoverflow — cloning session");
    session?.clone?.().then((c: any) => (session = c));
  });
  return session;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "AI_PROTECT_NANO_DETECT") {
    (async () => {
      const s = await ensureSession(msg.lexicon);
      if (!s) {
        sendResponse({ hits: [], map: {}, cleanText: msg.text });
        return;
      }
      const res = await detectWithNano(s, msg.text, msg.lexicon);
      // turn nano hits into map via lexicon decoys
      const map: Record<string, string> = {};
      for (const h of res.hits) {
        const entry = (msg.lexicon as any[]).find((e) => e.id === h.id);
        if (entry) map[entry.decoy] = entry.secret;
      }
      const exact = substituteExact(msg.text, { policyHash: "nano", lexicon: msg.lexicon });
      sendResponse({ hits: res.hits, map, cleanText: exact.cleanText });
    })();
    return true;
  }
});
