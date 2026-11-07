import os
import re
import xml.etree.ElementTree as ET
import requests

# 2026-11-04: DDG html/lite endpoints answer 202 (bot-block) to scripted requests,
# Bing serves either localized junk or a consent wall — scraper-hostile sources.
# Google News RSS is deterministic, bot-tolerant, and carries real links + dates.
GNEWS = "https://news.google.com/rss/search"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

def search_news(query, limit=8, hl="en-US", gl="US", ceid="US:en"):
    resp = requests.get(GNEWS, params={"q": query, "hl": hl, "gl": gl, "ceid": ceid},
                        headers={"User-Agent": UA}, timeout=20)
    resp.raise_for_status()
    items = ET.fromstring(resp.content).findall(".//item")[:limit]
    out = []
    for it in items:
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        date = (it.findtext("pubDate") or "").strip()
        if title and link:
            out.append(f"{title}\n{link}\n{date}")
    return out


def vacuum():
    queries = [
        "Shadow AI statistics 2026 enterprise",
        "anti-shadow ai browser extensions 2026",
        "enterprise AI governance tools and trends 2026"
    ]
    
    all_raw_data = []

    for q in queries:
        print(f"Vacuuming query: {q}")
        try:
            hits = search_news(q)
            if hits:
                all_raw_data.append(f"--- Query: {q} ---\n" + "\n".join(hits) + "\n")
            else:
                all_raw_data.append(f"--- Query: {q} ---\n0 results (blocked or empty SERP)")
        except Exception as e:
            all_raw_data.append(f"Exception on {q}: {str(e)}")

    output_path = "/tmp/shadow_ai_raw.txt"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(all_raw_data))
    
    print(f"Vacuum complete. Data dumped to {output_path}")

if __name__ == "__main__":
    vacuum()
