#!/usr/local/bin/python3
"""Daily Shadow AI gatherer (RSS → raw file → deterministic Obsidian append).

2026-11-04 cron-integrity changes (docs/ops/remediation-2026-11-04-cron-integrity.md):
- OUTPUT_FILE aligned to /tmp/shadow_ai_raw.txt — the daily *Shadow AI Update*
  cron prompt reads .txt while this wrote .md, so the LLM saw an empty file
  even on days the gather ran;
- the Obsidian append now happens HERE, deterministically. The *Update* LLM job
  (jobs.json 2424666b22a9) was converted to report-only: since ~2026-09-07 its
  "successful" runs printed unreachable pseudo-code instead of writing the note
  (LLMs must not be the write-path).
Launch via shadow_ai_gatherer.sh — the bare-cron `python3` env cannot import
requests/bs4 (both vacuums died exactly that way on 2026-09-28).
"""
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import os

# High-signal sources for Sovereign AI and Local LLM developments
SOURCES = {
    "Hacker News": "https://news.ycombinator.com/rss",
}

KEYWORDS = ["sovereign ai", "local llm", "self-hosted", "on-premise", "open source", "llama", "mistral", "ollama"]
OUTPUT_FILE = "/tmp/shadow_ai_raw.txt"
OBSIDIAN_NOTE = os.path.expanduser("~/Documents/Obsidian Vault/Shadow AI Research.md")
WEEKLY_LOG = os.path.expanduser("~/.hermes/scripts/shadow_ai_weekly_log.txt")

def gather():
    found = []
    print(f"Starting gather at {datetime.now()}...")
    
    for name, url in SOURCES.items():
        try:
            print(f"Fetching {name}...")
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            
            # RSS feeds are usually XML; BeautifulSoup with 'xml' is better but we can use the default parser for basic cases
            soup = BeautifulSoup(resp.content, 'html.parser') 
            
            items = soup.find_all('item')
            if not items: # fallback for non-RSS patterns
                items = soup.find_all(['article', 'div'], class_='storyentry')

            for item in items:
                title_elem = item.find('title')
                link_elem = item.find('link')
                
                if title_elem and link_elem:
                    title = title_elem.get_text().strip()
                    link = link_elem.get_text().strip()
                    
                    if any(k in title.lower() for k in KEYWORDS):
                        found.append(f"- [{title}]({link})")
        except Exception as e:
            print(f"Error fetching {name}: {e}")

    # 1. Daily Snapshot (Overwrites) - used by the Daily Cron Job synthesis
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        if found:
            content = f"# Shadow AI Raw Hits - {datetime.now().strftime('%Y-%m-%d')}\n\n" + "\n".join(found)
            f.write(content)
        else:
            content = "No matches today."
            f.write(content)
    
    # 2. Weekly Log (Appends) - used by the Weekly Cron Job synthesis
    if found:
        with open(WEEKLY_LOG, "a", encoding="utf-8") as wf:
            wf.write(f"--- {datetime.now().strftime('%Y-%m-%d')} ---\n")
            wf.write("\n".join(found) + "\n\n")
    
    # 3. Deterministic Obsidian append — the LLM *Update* job no longer writes.
    if found and os.path.exists(os.path.dirname(OBSIDIAN_NOTE)):
        try:
            day = datetime.now().strftime("%Y-%m-%d")
            with open(OBSIDIAN_NOTE, "a", encoding="utf-8") as nf:
                nf.write(f"\n\n## Gatherer — {day}\n" + "\n".join(found) + "\n")
            print(f"Obsidian note appended: {OBSIDIAN_NOTE}")
        except Exception as e:
            print(f"Obsidian append failed (non-fatal): {e}")

    print(f"\n--- START OF DATA ---\n{content}\n--- END OF DATA ---")
    if found:
        print(f"Weekly log updated at {WEEKLY_LOG}")
    print(f"\nGather complete. Found {len(found)} items.")

if __name__ == "__main__":
    gather()
