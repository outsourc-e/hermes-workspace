/**
 * Minimal Aho-Corasick for company_secrets multi-phrase exact matching.
 * Normalized NFKC lower unless caseSensitive. Longest-first ranking.
 * No deps, sync, <1ms for ~2k entries.
 */
import type { LexiconEntry, Hit } from "@ai-protect/shared";

interface Node {
  next: Map<string, Node>;
  fail: Node | null;
  output: LexiconEntry[];
}

function normalize(s: string, caseSensitive: boolean) {
  const n = s.normalize("NFKC");
  return caseSensitive ? n : n.toLowerCase();
}

export class CompanySecretsTrie {
  private root: Node = { next: new Map(), fail: null, output: [] };
  private entries: LexiconEntry[];

  constructor(entries: LexiconEntry[]) {
    this.entries = [...entries].sort((a, b) => b.secret.length - a.secret.length);
    for (const e of this.entries) this.insert(e);
    this.buildFail();
  }

  private insert(e: LexiconEntry) {
    const key = normalize(e.secret, !!e.caseSensitive);
    let node = this.root;
    for (const ch of key) {
      if (!node.next.has(ch)) node.next.set(ch, { next: new Map(), fail: null, output: [] });
      node = node.next.get(ch)!;
    }
    node.output.push(e);
  }

  private buildFail() {
    const queue: Node[] = [];
    for (const child of this.root.next.values()) {
      child.fail = this.root;
      queue.push(child);
    }
    while (queue.length) {
      const cur = queue.shift()!;
      for (const [ch, child] of cur.next) {
        let f = cur.fail;
        while (f && !f.next.has(ch)) f = f.fail;
        child.fail = f ? f.next.get(ch) ?? this.root : this.root;
        child.output.push(...(child.fail.output ?? []));
        queue.push(child);
      }
    }
  }

  /** Returns hits with start/end in original text indices (normalized length may differ — we map via scanning). */
  search(text: string): Hit[] {
    const hits: Hit[] = [];
    // We scan normalized view but need to map indices: simplistic — normalize lowercased view length usually same for ASCII; for full correctness we could track mapping. Good enough for v0.
    const lower = text.normalize("NFKC").toLowerCase();
    let node: Node = this.root;
    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i];
      while (node !== this.root && !node.next.has(ch)) node = node.fail!;
      node = node.next.get(ch) ?? this.root;
      if (node.output.length) {
        for (const e of node.output) {
          const len = normalize(e.secret, !!e.caseSensitive).length;
          const start = i - len + 1;
          const end = i + 1;
          if (start < 0) continue;
          // verify original substring normalized matches (guards caseSensitive weirdness)
          const slice = normalize(text.slice(start, end), !!e.caseSensitive);
          if (slice !== normalize(e.secret, !!e.caseSensitive)) continue;
          hits.push({ id: e.id, surface: text.slice(start, end), start, end, confidence: 1, source: "exact" });
        }
      }
    }
    // Deduplicate to longest non-overlapping: sort by start asc, length desc, greedy pick
    hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const picked: Hit[] = [];
    let lastEnd = -1;
    for (const h of hits) {
      if (h.start >= lastEnd) {
        picked.push(h);
        lastEnd = h.end;
      } else {
        // overlapping — keep longer (already sorted)
        continue;
      }
    }
    return picked;
  }

  /** For rehydration: map decoy -> LexiconEntry */
  getById(id: string) {
    return this.entries.find((e) => e.id === id);
  }

  getByDecoy(decoy: string) {
    return this.entries.find((e) => e.decoy === decoy);
  }
}
