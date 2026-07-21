#!/usr/bin/env python3
"""Import existing Alura/Product Research files into a Workspace-owned SQLite DB.

Safety contract:
- Reads source files from ~/.hermes/product-research only.
- Writes only under this Workspace repository: data/product-intelligence/.
- Does not edit Etsy, Alura, Google Sheets, source JSON/CSV/TSV, or external services.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = Path.home() / ".hermes" / "product-research"
DEFAULT_SEO_DIR = Path.home() / ".hermes" / "seo-research-db"
DEFAULT_OUTPUT_DIR = WORKSPACE_ROOT / "data" / "product-intelligence"
DB_NAME = "product_intelligence.db"
SUMMARY_NAME = "summary.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slug(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return value or "item"


def stable_id(prefix: str, *parts: object) -> str:
    raw = "\u241f".join(str(p or "") for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:14]
    label = slug(str(parts[0] if parts else prefix))[:36]
    return f"{prefix}_{label}_{digest}"


def read_json(path: Path) -> Any | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8", errors="ignore"))


def read_delimited(path: Path, delimiter: str) -> list[dict[str, str]]:
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8-sig", errors="ignore")
    reader = csv.DictReader(text.splitlines(), delimiter=delimiter)
    return [dict(row) for row in reader]


def first_present(row: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace(",", "").strip()
    # Alura UI proof text sometimes contains spacing; keep only a basic numeric token.
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def raw_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    # This DB is a Workspace-owned read copy. Use DELETE journaling so the API can
    # open the final file read-only without needing WAL sidecar files.
    con.execute("PRAGMA journal_mode=DELETE")
    con.execute("PRAGMA foreign_keys=ON")
    return con


SCHEMA = """
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_size INTEGER NOT NULL,
  source_mtime REAL NOT NULL,
  sha1 TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id),
  run_type TEXT NOT NULL,
  mode TEXT,
  started_at TEXT,
  completed_at TEXT,
  requested_count INTEGER,
  successful_count INTEGER,
  failed_count INTEGER,
  summary TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  shop_id TEXT NOT NULL REFERENCES stores(id),
  source_id TEXT REFERENCES sources(id),
  source_file TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  niche TEXT,
  category TEXT,
  product_type TEXT,
  etsy_angle TEXT,
  variant_plan TEXT,
  status TEXT NOT NULL,
  current_room TEXT NOT NULL,
  assigned_agent TEXT,
  alura_evidence TEXT,
  shotlab_status TEXT,
  notes TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  source_id TEXT REFERENCES sources(id),
  run_id TEXT REFERENCES research_runs(id),
  score REAL,
  search_volume REAL,
  competition REAL,
  conversion_rate REAL,
  sales REAL,
  avg_sales REAL,
  revenue REAL,
  avg_revenue REAL,
  views REAL,
  avg_views REAL,
  competition_level TEXT,
  avg_price REAL,
  current_room TEXT NOT NULL DEFAULT 'oracle',
  raw_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS keyword_edges (
  id TEXT PRIMARY KEY,
  from_keyword_id TEXT REFERENCES keywords(id) ON DELETE CASCADE,
  to_keyword_id TEXT REFERENCES keywords(id) ON DELETE CASCADE,
  from_keyword TEXT NOT NULL,
  to_keyword TEXT NOT NULL,
  relation TEXT NOT NULL,
  source TEXT,
  parent_run_id TEXT,
  discovered_at TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_keywords (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  keyword_id TEXT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  strength REAL,
  note TEXT,
  PRIMARY KEY (product_id, keyword_id, relation_type)
);

CREATE TABLE IF NOT EXISTS supplier_links (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  search_query TEXT,
  status TEXT NOT NULL,
  risk_flags TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_events (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  from_room TEXT,
  to_room TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  agent TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  path TEXT NOT NULL,
  source_tool TEXT,
  status TEXT NOT NULL,
  raw_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_title ON products(normalized_title);
CREATE INDEX IF NOT EXISTS idx_products_room ON products(current_room);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_keywords_score ON keywords(score);
CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_keyword_edges_from ON keyword_edges(from_keyword_id);
CREATE INDEX IF NOT EXISTS idx_keyword_edges_to ON keyword_edges(to_keyword_id);
CREATE INDEX IF NOT EXISTS idx_supplier_product ON supplier_links(product_id);
"""


def init_db(con: sqlite3.Connection, reset: bool) -> None:
    if reset:
        con.executescript(
            """
            DROP TABLE IF EXISTS assets;
            DROP TABLE IF EXISTS workflow_events;
            DROP TABLE IF EXISTS supplier_links;
            DROP TABLE IF EXISTS product_keywords;
            DROP TABLE IF EXISTS keyword_edges;
            DROP TABLE IF EXISTS keywords;
            DROP TABLE IF EXISTS products;
            DROP TABLE IF EXISTS research_runs;
            DROP TABLE IF EXISTS sources;
            DROP TABLE IF EXISTS stores;
            """
        )
    con.executescript(SCHEMA)
    ts = now_iso()
    con.execute(
        "INSERT OR IGNORE INTO stores(id, name, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("dolaro_boutique", "DolaroBoutique", "active", "First shop / active product research source.", ts, ts),
    )


def source_kind(path: Path) -> str:
    name = path.name.lower()
    if name.endswith(".json"):
        return "json"
    if name.endswith(".csv"):
        return "csv"
    if name.endswith(".tsv"):
        return "tsv"
    if name.endswith(".md"):
        return "markdown"
    if name.endswith(".xlsx"):
        return "xlsx"
    return "file"


def file_sha1(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def add_source(con: sqlite3.Connection, path: Path) -> str:
    st = path.stat()
    sid = stable_id("src", path.name, st.st_size, st.st_mtime)
    con.execute(
        """
        INSERT OR REPLACE INTO sources(id, source_path, source_name, source_kind, source_size, source_mtime, sha1, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (sid, str(path), path.name, source_kind(path), st.st_size, st.st_mtime, file_sha1(path), now_iso()),
    )
    return sid


def upsert_keyword(con: sqlite3.Connection, keyword: str, source_id: str | None, run_id: str | None, metrics: dict[str, Any] | None = None) -> str:
    metrics = metrics or {}
    keyword = re.sub(r"\s+", " ", keyword).strip().lower()
    kid = stable_id("kw", keyword)
    avg_price = None
    avg_prices = metrics.get("avg_prices")
    if isinstance(avg_prices, dict):
        avg_price = to_float(avg_prices.get("USD") or avg_prices.get("ILS") or next(iter(avg_prices.values()), None))
    if avg_price is None:
        avg_price = to_float(metrics.get("avg_price") or metrics.get("average_price"))
    ts = now_iso()
    con.execute(
        """
        INSERT INTO keywords(
          id, keyword, source_id, run_id, score, search_volume, competition, conversion_rate, sales, avg_sales,
          revenue, avg_revenue, views, avg_views, competition_level, avg_price, current_room, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'oracle', ?, ?, ?)
        ON CONFLICT(keyword) DO UPDATE SET
          source_id=excluded.source_id,
          run_id=coalesce(excluded.run_id, keywords.run_id),
          score=coalesce(excluded.score, keywords.score),
          search_volume=coalesce(excluded.search_volume, keywords.search_volume),
          competition=coalesce(excluded.competition, keywords.competition),
          conversion_rate=coalesce(excluded.conversion_rate, keywords.conversion_rate),
          sales=coalesce(excluded.sales, keywords.sales),
          avg_sales=coalesce(excluded.avg_sales, keywords.avg_sales),
          revenue=coalesce(excluded.revenue, keywords.revenue),
          avg_revenue=coalesce(excluded.avg_revenue, keywords.avg_revenue),
          views=coalesce(excluded.views, keywords.views),
          avg_views=coalesce(excluded.avg_views, keywords.avg_views),
          competition_level=coalesce(excluded.competition_level, keywords.competition_level),
          avg_price=coalesce(excluded.avg_price, keywords.avg_price),
          raw_json=excluded.raw_json,
          updated_at=excluded.updated_at
        """,
        (
            kid,
            keyword,
            source_id,
            run_id,
            to_float(metrics.get("score") or metrics.get("keyword_score")),
            to_float(metrics.get("search_volume") or metrics.get("searchVolume") or metrics.get("volume")),
            to_float(metrics.get("competition") or metrics.get("competing_listings")),
            to_float(metrics.get("conversion_rate") or metrics.get("avg_conversion_rate")),
            to_float(metrics.get("sales")),
            to_float(metrics.get("avg_sales")),
            to_float(metrics.get("revenue")),
            to_float(metrics.get("avg_revenue")),
            to_float(metrics.get("views")),
            to_float(metrics.get("avg_views")),
            metrics.get("competition_level") or metrics.get("competitionLevel"),
            avg_price,
            raw_json(metrics),
            ts,
            ts,
        ),
    )
    return kid


def insert_product(con: sqlite3.Connection, *, title: str, source_id: str | None, source_file: str, source_kind_value: str,
                   niche: str = "", category: str = "", product_type: str = "", etsy_angle: str = "",
                   variant_plan: str = "", status: str = "imported", current_room: str = "atlantis",
                   assigned_agent: str = "Archivist", alura_evidence: str = "", shotlab_status: str = "",
                   notes: str = "", row: dict[str, Any] | None = None) -> str:
    title = re.sub(r"\s+", " ", title).strip()
    pid = stable_id("prod", title, niche, source_file)
    ts = now_iso()
    con.execute(
        """
        INSERT INTO products(
          id, title, normalized_title, shop_id, source_id, source_file, source_kind, niche, category, product_type,
          etsy_angle, variant_plan, status, current_room, assigned_agent, alura_evidence, shotlab_status, notes, raw_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, 'dolaro_boutique', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status=excluded.status,
          current_room=excluded.current_room,
          assigned_agent=excluded.assigned_agent,
          updated_at=excluded.updated_at,
          raw_json=excluded.raw_json
        """,
        (
            pid, title, title.lower(), source_id, source_file, source_kind_value, niche or None, category or None,
            product_type or None, etsy_angle or None, variant_plan or None, status, current_room, assigned_agent,
            alura_evidence or None, shotlab_status or None, notes or None, raw_json(row or {}), ts, ts,
        ),
    )
    con.execute(
        "INSERT OR IGNORE INTO workflow_events(id, product_id, from_room, to_room, event_type, message, agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (stable_id("evt", pid, "import", current_room), pid, None, current_room, "import", f"Imported from {source_file}", assigned_agent, ts),
    )
    return pid


def add_product_keyword(con: sqlite3.Connection, product_id: str, keyword_id: str, relation_type: str, note: str = "", strength: float | None = None) -> None:
    con.execute(
        "INSERT OR IGNORE INTO product_keywords(product_id, keyword_id, relation_type, strength, note) VALUES (?, ?, ?, ?, ?)",
        (product_id, keyword_id, relation_type, strength, note or None),
    )


def add_keyword_edge(con: sqlite3.Connection, *, from_keyword: str, to_keyword: str, relation: str, source: str = "", parent_run_id: str = "", discovered_at: str = "", raw: dict[str, Any] | None = None) -> None:
    from_keyword = re.sub(r"\s+", " ", from_keyword).strip().lower()
    to_keyword = re.sub(r"\s+", " ", to_keyword).strip().lower()
    if not from_keyword or not to_keyword:
        return
    from_id = upsert_keyword(con, from_keyword, None, None, {"source": source or "keyword_edge"})
    to_id = upsert_keyword(con, to_keyword, None, None, {"source": source or "keyword_edge"})
    con.execute(
        """
        INSERT OR IGNORE INTO keyword_edges(id, from_keyword_id, to_keyword_id, from_keyword, to_keyword, relation, source, parent_run_id, discovered_at, raw_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (stable_id("edge", from_keyword, to_keyword, relation, parent_run_id), from_id, to_id, from_keyword, to_keyword, relation, source or None, parent_run_id or None, discovered_at or None, raw_json(raw or {}), now_iso()),
    )


def add_supplier_link(con: sqlite3.Connection, product_id: str, platform: str, url: str, query: str = "", status: str = "needs_review", row: dict[str, Any] | None = None) -> None:
    if not url:
        return
    con.execute(
        """
        INSERT OR IGNORE INTO supplier_links(id, product_id, platform, url, search_query, status, risk_flags, raw_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (stable_id("sup", product_id, platform, url), product_id, platform, url, query or None, status, None, raw_json(row or {}), now_iso(), now_iso()),
    )


def import_state(con: sqlite3.Connection, source_dir: Path) -> None:
    path = source_dir / "state.json"
    data = read_json(path)
    if not isinstance(data, dict):
        return
    sid = add_source(con, path)
    run_id = stable_id("run", path.name, data.get("generated_at"), data.get("mode"))
    alura = data.get("alura") or data.get("alura_quota") or {}
    con.execute(
        "INSERT OR REPLACE INTO research_runs(id, source_id, run_type, mode, started_at, completed_at, requested_count, successful_count, failed_count, summary, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (run_id, sid, "state", data.get("mode"), None, data.get("generated_at"), to_float(alura.get("requested_keyword_searches") or alura.get("requested_total")), to_float(alura.get("successful_keyword_searches")), to_float(alura.get("failed_keyword_searches")), (data.get("dashboard") or {}).get("summary"), raw_json(data), now_iso()),
    )
    for row in data.get("keywords", []) if isinstance(data.get("keywords"), list) else []:
        if isinstance(row, dict) and row.get("keyword"):
            upsert_keyword(con, row["keyword"], sid, run_id, row)
    for row in data.get("suggested_products", []) if isinstance(data.get("suggested_products"), list) else []:
        if not isinstance(row, dict):
            continue
        title = first_present(row, "Product Suggestion", "product", "Product", "title")
        if not title:
            continue
        keyword = first_present(row, "Keyword / Trend", "keyword", "Keyword")
        pid = insert_product(
            con,
            title=title,
            source_id=sid,
            source_file=path.name,
            source_kind_value="state_suggested_product",
            niche=first_present(row, "Store Niche", "niche"),
            product_type=first_present(row, "Product Type", "product_type"),
            etsy_angle=first_present(row, "Etsy Angle", "etsy_angle"),
            variant_plan=first_present(row, "Variant Plan", "variant_plan"),
            status=first_present(row, "Status", "status") or "suggested",
            current_room="agora",
            assigned_agent="Agora Researcher",
            alura_evidence=first_present(row, "Alura Stats", "Alura Evidence", "alura_evidence"),
            shotlab_status=first_present(row, "ShotLab Verdict", "shotlab"),
            notes=first_present(row, "Supplier Proof", "notes"),
            row=row,
        )
        if keyword:
            kid = upsert_keyword(con, keyword, sid, run_id, {})
            add_product_keyword(con, pid, kid, "source_keyword", first_present(row, "Alura Stats", "Alura Evidence"))
        add_supplier_link(con, pid, "Alibaba", extract_url(first_present(row, "Main Supplier Link", "source_url")), first_present(row, "Supplier Search Query", "keyword"), row=row)
        add_supplier_link(con, pid, "AliExpress", extract_url(first_present(row, "Backup Link", "backup_url")), first_present(row, "Supplier Search Query", "keyword"), row=row)


def extract_url(value: str) -> str:
    if not value:
        return ""
    # Google Sheets formulas: =HYPERLINK("url","label")
    match = re.search(r'HYPERLINK\("([^"]+)"', value)
    if match:
        return match.group(1)
    match = re.search(r"https?://[^\s\"]+", value)
    if match:
        return match.group(0)
    return value if value.startswith("http") else ""


def import_raw_alura(con: sqlite3.Connection, source_dir: Path) -> None:
    for name in ["alura-raw-latest.json", "alura-ui-20-keyword-direct-proof.json", "nonintrusive-alura-20-latest.json", "alura-ui-nonjewelry-direct-latest.json", "alura-ui-run-latest.json"]:
        path = source_dir / name
        data = read_json(path)
        if not isinstance(data, dict):
            continue
        sid = add_source(con, path)
        run_id = stable_id("run", name, data.get("startedAt") or data.get("generated_at"), data.get("completedAt") or data.get("usage"))
        keyword_results = data.get("keywordResults") if isinstance(data.get("keywordResults"), list) else data.get("completed")
        requested = data.get("requested") or data.get("requested_limit") or len(keyword_results or [])
        successful = len(keyword_results or []) if isinstance(keyword_results, list) else None
        con.execute(
            "INSERT OR REPLACE INTO research_runs(id, source_id, run_type, mode, started_at, completed_at, requested_count, successful_count, failed_count, summary, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (run_id, sid, "alura", data.get("mode") or data.get("method"), data.get("startedAt"), data.get("completedAt") or data.get("generated_at"), to_float(requested), to_float(successful), None, f"Imported {name}", raw_json({k: v for k, v in data.items() if k not in {"keywordResults", "listingResults"}}), now_iso()),
        )
        if isinstance(keyword_results, list):
            for item in keyword_results:
                if not isinstance(item, dict):
                    continue
                keyword = item.get("keyword")
                metrics: dict[str, Any] = {}
                overview = item.get("overview")
                if isinstance(overview, dict):
                    metrics = ((overview.get("data") or {}).get("results") or {}) if isinstance(overview.get("data"), dict) else {}
                elif item.get("ok") and item.get("proof_lines"):
                    metrics = {"proof_lines": item.get("proof_lines"), "before_usage": item.get("before_usage"), "after_usage": item.get("after_usage")}
                if keyword:
                    upsert_keyword(con, str(keyword), sid, run_id, metrics)
        # Listing result keys are useful keywords even when full rows are not normalized yet.
        listing_results = data.get("listingResults")
        if isinstance(listing_results, dict):
            for keyword, payload in listing_results.items():
                upsert_keyword(con, str(keyword), sid, run_id, {"listing_payload_summary": summarize_payload(payload)})
        related = data.get("related_discovered") or data.get("related_keywords_discovered")
        if isinstance(related, list):
            for item in related:
                if isinstance(item, str):
                    upsert_keyword(con, item, sid, run_id, {"relation": "related_discovered"})
                elif isinstance(item, dict) and item.get("keyword"):
                    upsert_keyword(con, item["keyword"], sid, run_id, item)


def summarize_payload(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict):
        return {"keys": list(payload.keys())[:20], "ok": payload.get("ok"), "statusCode": payload.get("statusCode")}
    return {"type": type(payload).__name__}


def import_product_tables(con: sqlite3.Connection, source_dir: Path) -> None:
    specs = [
        ("new-store-niches-products.csv", ",", "new_store_niche"),
        ("new-store-niches-products.tsv", "\t", "new_store_niche"),
        ("suggested-products.tsv", "\t", "suggested_product"),
        ("suggested-products-append.tsv", "\t", "suggested_product_append"),
    ]
    seen_products: set[str] = set()
    for filename, delimiter, kind in specs:
        path = source_dir / filename
        rows = read_delimited(path, delimiter)
        if not rows:
            continue
        sid = add_source(con, path)
        run_id = stable_id("run", filename, len(rows), path.stat().st_mtime)
        con.execute(
            "INSERT OR REPLACE INTO research_runs(id, source_id, run_type, mode, started_at, completed_at, requested_count, successful_count, failed_count, summary, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (run_id, sid, "product_table", kind, None, None, len(rows), len(rows), 0, f"Imported {len(rows)} rows from {filename}", raw_json({"file": filename, "rows": len(rows)}), now_iso()),
        )
        for row in rows:
            title = first_present(row, "Product", "Product Suggestion", "product")
            if not title:
                continue
            niche = first_present(row, "Store Niche", "niche")
            dedupe_key = f"{filename}:{title}:{niche}"
            if dedupe_key in seen_products:
                continue
            seen_products.add(dedupe_key)
            keyword = first_present(row, "Keyword / Trend", "Keyword", "Alura Evidence")
            current_room = "agora"
            pid = insert_product(
                con,
                title=title,
                source_id=sid,
                source_file=filename,
                source_kind_value=kind,
                niche=niche,
                product_type=first_present(row, "Product Type"),
                etsy_angle=first_present(row, "Etsy-safe Angle", "Etsy Angle"),
                variant_plan=first_present(row, "Variant Plan"),
                status=first_present(row, "Status") or "imported",
                current_room=current_room,
                assigned_agent="Agora Researcher",
                alura_evidence=first_present(row, "Alura Evidence", "Alura Stats"),
                shotlab_status=first_present(row, "ShotLab Suitability", "ShotLab Verdict"),
                notes=" | ".join(x for x in [first_present(row, "Why This Niche Works"), first_present(row, "Copy In Our Own Way"), first_present(row, "Supplier Proof")] if x),
                row=row,
            )
            # Link explicit query/evidence as keyword text when sensible.
            supplier_query = first_present(row, "Supplier Search Query")
            keyword_text = first_present(row, "Keyword / Trend") or supplier_query or title
            if keyword_text:
                kid = upsert_keyword(con, keyword_text, sid, run_id, {"source_file": filename})
                add_product_keyword(con, pid, kid, "source_keyword", first_present(row, "Alura Evidence", "Alura Stats"))
            add_supplier_link(con, pid, "AliExpress", first_present(row, "AliExpress Search URL") or extract_url(first_present(row, "Backup Link")), supplier_query, row=row)
            add_supplier_link(con, pid, "Alibaba", first_present(row, "Alibaba Search URL") or extract_url(first_present(row, "Main Supplier Link")), supplier_query, row=row)


def import_seo_research_db(con: sqlite3.Connection, seo_dir: Path) -> None:
    """Import DLV's standalone SEO Research DB into the Workspace read-copy.

    This reads only local JSONL/NDJSON files and does not run browser searches or
    touch Etsy/Alura/ShotLab/Firebase.
    """
    if not seo_dir.exists():
        return

    keywords_path = seo_dir / "keywords.jsonl"
    edges_path = seo_dir / "edges.jsonl"
    export_keywords_path = seo_dir / "firebase-export" / "seo_keywords.ndjson"
    export_edges_path = seo_dir / "firebase-export" / "seo_keyword_edges.ndjson"

    keyword_source = keywords_path if keywords_path.exists() else export_keywords_path
    edge_source = edges_path if edges_path.exists() else export_edges_path

    run_id = stable_id("run", "seo-research-db", keyword_source.stat().st_mtime if keyword_source.exists() else "missing")

    source_ids: list[str] = []
    for path in [keyword_source, edge_source]:
        if path.exists():
            source_ids.append(add_source(con, path))
    sid = source_ids[0] if source_ids else None

    if sid:
        con.execute(
            "INSERT OR REPLACE INTO research_runs(id, source_id, run_type, mode, started_at, completed_at, requested_count, successful_count, failed_count, summary, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (run_id, sid, "seo_research_db", "local_jsonl_import", None, now_iso(), None, None, None, "Imported local SEO Research DB keywords/tags and relationships", raw_json({"seo_dir": str(seo_dir), "keywords_file": str(keyword_source), "edges_file": str(edge_source)}), now_iso()),
        )

    if keyword_source.exists():
        with keyword_source.open(encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                if not line.strip():
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                data = row.get("data") if isinstance(row, dict) else None
                if not isinstance(data, dict):
                    data = row if isinstance(row, dict) else {}
                if isinstance(row, dict):
                    keyword = data.get("keyword") or data.get("canonical") or row.get("keyword")
                else:
                    keyword = data.get("keyword") or data.get("canonical")
                if not keyword:
                    continue
                metrics_raw = data.get("metrics")
                metrics = dict(metrics_raw) if isinstance(metrics_raw, dict) else {}
                metrics.update({"seo_source": data.get("source"), "searchCount": data.get("searchCount"), "clusters": data.get("clusters"), "ui": data.get("ui")})
                upsert_keyword(con, str(keyword), sid, run_id, metrics)

    if edge_source.exists():
        with edge_source.open(encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                if not line.strip():
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                data = row.get("data") if isinstance(row, dict) else None
                if not isinstance(data, dict):
                    data = row if isinstance(row, dict) else {}
                add_keyword_edge(
                    con,
                    from_keyword=str(data.get("from") or ""),
                    to_keyword=str(data.get("to") or ""),
                    relation=str(data.get("relation") or "related_keyword"),
                    source=str(data.get("source") or "seo_research_db"),
                    parent_run_id=str(data.get("parentRunId") or run_id),
                    discovered_at=str(data.get("discoveredAt") or ""),
                    raw=data,
                )


def build_summary(con: sqlite3.Connection, db_path: Path, source_dir: Path, summary_path: Path) -> dict[str, Any]:
    def one(sql: str, params: Iterable[Any] = ()) -> Any:
        return con.execute(sql, tuple(params)).fetchone()[0]

    def rows(sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
        return [dict(r) for r in con.execute(sql, tuple(params)).fetchall()]

    summary = {
        "ok": True,
        "generated_at": now_iso(),
        "workspace_root": str(WORKSPACE_ROOT),
        "source_dir_read_only": str(source_dir),
        "db_path": str(db_path),
        "counts": {
            "sources": one("SELECT count(*) FROM sources"),
            "research_runs": one("SELECT count(*) FROM research_runs"),
            "products": one("SELECT count(*) FROM products"),
            "keywords": one("SELECT count(*) FROM keywords"),
            "keyword_edges": one("SELECT count(*) FROM keyword_edges"),
            "product_keywords": one("SELECT count(*) FROM product_keywords"),
            "supplier_links": one("SELECT count(*) FROM supplier_links"),
            "workflow_events": one("SELECT count(*) FROM workflow_events"),
            "assets": one("SELECT count(*) FROM assets"),
            "stores": one("SELECT count(*) FROM stores"),
        },
        "room_counts": rows("SELECT current_room AS room, count(*) AS count FROM products GROUP BY current_room ORDER BY count DESC"),
        "keyword_room_counts": rows("SELECT current_room AS room, count(*) AS count FROM keywords GROUP BY current_room ORDER BY count DESC"),
        "top_products": rows("SELECT id, title, niche, status, current_room, etsy_angle, shotlab_status FROM products ORDER BY updated_at DESC LIMIT 12"),
        "top_keywords": rows("SELECT keyword, score, search_volume, competition, avg_sales, current_room FROM keywords ORDER BY score DESC NULLS LAST, avg_sales DESC NULLS LAST LIMIT 20"),
        "safety": {
            "source_modified": False,
            "etsy_actions": False,
            "supplier_messages": False,
            "purchases": False,
            "workspace_copy_only": True,
        },
    }
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    ap.add_argument("--seo-dir", type=Path, default=DEFAULT_SEO_DIR)
    ap.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--reset", action="store_true", help="Rebuild the Workspace-owned DB from scratch.")
    args = ap.parse_args()

    source_dir = args.source_dir.expanduser().resolve()
    seo_dir = args.seo_dir.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()

    if not source_dir.exists():
        print(json.dumps({"ok": False, "error": f"Source dir not found: {source_dir}"}), file=sys.stderr)
        return 2
    try:
        output_dir.relative_to(WORKSPACE_ROOT)
    except ValueError:
        print(json.dumps({"ok": False, "error": f"Output dir must stay inside Workspace: {WORKSPACE_ROOT}"}), file=sys.stderr)
        return 2

    db_path = output_dir / DB_NAME
    summary_path = output_dir / SUMMARY_NAME
    tmp_db_path = output_dir / f".{DB_NAME}.tmp"
    tmp_summary_path = output_dir / f".{SUMMARY_NAME}.tmp"

    # Rebuild a complete temporary read-copy first, then atomically swap it into
    # place. This keeps the live Workspace API from seeing a half-written DB.
    output_dir.mkdir(parents=True, exist_ok=True)
    for stale in [tmp_db_path, tmp_summary_path, Path(f"{tmp_db_path}-journal"), Path(f"{tmp_db_path}-wal"), Path(f"{tmp_db_path}-shm")]:
        if stale.exists():
            stale.unlink()

    con = connect(tmp_db_path)
    try:
        init_db(con, reset=True)
        import_state(con, source_dir)
        import_raw_alura(con, source_dir)
        import_product_tables(con, source_dir)
        import_seo_research_db(con, seo_dir)
        con.commit()
        summary = build_summary(con, db_path, source_dir, tmp_summary_path)
    finally:
        con.close()

    os.replace(tmp_db_path, db_path)
    os.replace(tmp_summary_path, summary_path)

    print(json.dumps({
        "ok": True,
        "db_path": str(db_path),
        "summary_path": str(summary_path),
        "counts": summary["counts"],
        "room_counts": summary["room_counts"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
