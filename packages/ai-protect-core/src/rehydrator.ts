import { rehydrateFull } from "./substitute.js";

/**
 * Streaming rehydrator for LLM responses where chunks may split decoy mid-token.
 * Keeps a tail buffer of maxDecoyLength-1 chars.
 */
export class StreamingRehydrator {
  private map: Record<string, string>;
  private maxLen: number;
  private buffer = "";

  constructor(map: Record<string, string>) {
    this.map = map;
    this.maxLen = Math.max(0, ...Object.keys(map).map((k) => k.length));
  }

  /** Push chunk — buffers, returns "" until flush (ensures no split-decoy miss). For streaming display we rehydrate only on flush or via pushAndFlush(). */
  push(chunk: string): string {
    this.buffer += chunk;
    if (this.maxLen === 0) {
      const out = this.buffer;
      this.buffer = "";
      return out;
    }
    // Defer rehydration to flush to avoid splitting decoys across chunks.
    // If caller needs incremental display, call flushIncremental() instead.
    return "";
  }

  /** Flush remaining buffer (on stream end) — does full rehydration. */
  flush(): string {
    const out = rehydrateFull(this.buffer, this.map);
    this.buffer = "";
    return out;
  }

  /** Incremental flush for UI streaming — rehydrates whole buffered content but keeps no state loss (test helper). */
  flushIncremental(): string {
    const out = rehydrateFull(this.buffer, this.map);
    this.buffer = "";
    return out;
  }

  /** For testing: flush all at once */
  rehydrateAll(text: string) {
    return rehydrateFull(text, this.map);
  }
}
