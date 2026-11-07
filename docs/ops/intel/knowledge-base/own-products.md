# Own Products — Baseline Feature Profile

> Baseline against which all competitors/partners are compared.
> Sources: privacyscrubber.com (fetched 2026-08-26), Obsidian vault strategy docs
> (`Strategy_AI_Protect_Growth.md`, `AI-Protect Intelligence.md`).
> Maintained by product-intel agent; feature claims below are first-party.

---

## PrivacyScrubber

**URL:** https://privacyscrubber.com/ · **Cluster:** client-anonymization · **Type:** own product

**Positioning:** Zero-server PII redaction workspace for AI prompts/documents. "100% local in browser RAM — zero data ever leaves your device." Verified zero egress in Airplane Mode.

### Features (per taxonomy)

| Dimension | Value | Notes |
|---|---|---|
| shadow_ai_tool_discovery | none | out of scope |
| ai_agent_inventory | none | |
| mcp_server_discovery | none | ships an MCP server, does not discover others |
| browser_extension_coverage | full | Chrome MV3 extension; in-DOM masking on ChatGPT, Claude, Gemini, Copilot, DeepSeek, Perplexity, Grok, Qwen, Kimi, Zendesk; context-menu masking |
| endpoint_agent_coverage | none | browser/web only |
| saas_api_integrations | none | by design (zero server) |
| pii_detection_breadth | full | 18 core Safe Harbor entities + 25 industry detection profiles (HIPAA 18 PHI, legal, finance, W-2/payroll, DevOps secrets, CRM…) |
| deterministic_regex_engine | full | sub-2 ms, zero hallucination claim, 100% reproducible tokenization |
| ml_llm_detection | partial | optional local NER semantic model (~35 MB download, PRO) |
| context_preserving_tokenization | full | token placeholders with custom Token Labels ([PATIENT_ID]) giving LLM domain context |
| reversible_reveal | full | 1-click local detokenization of AI responses via volatile RAM session map |
| file_document_sanitization | full | .txt/.docx/.pdf (Tesseract WASM OCR)/.xlsx/.csv; Excel cell scrub preserving formulas; batch 50+ files (PRO) |
| custom_rules_regex | full | unlimited PRO custom regex; CISO central hard-lock rules via MDM/Chrome Enterprise |
| inline_realtime_redaction | full | in-page auto-detection while typing in 9–11 LLM UIs |
| runtime_access_control | none | |
| policy_engine | partial | Team Blueprints: admin-signed locked config pushed P2P, no backend |
| admin_lock_mdm | full | CISO Extension Lock tier (Teams); 🔒 Enterprise badge prevents bypass |
| audit_trail_receipts | full | signed SHA-256 PDF audit receipts ("CISO receipt") per session |
| multi_tenancy | none | flat Teams pricing, no backend accounts |
| agent_runtime_guardrails | partial | MCP server sanitizes prompts for coding agents pre-submission; no runtime tool-call enforcement |
| hooks_level_interception | none | gap vs Nightfall |
| tool_call_governance | none | |
| mcp_gateway_security | partial | PII MCP Server (@privacyscrubber/mcp-server, stdio) for Cursor/Windsurf/Claude Desktop/VS Code |
| agent_red_teaming | none | |
| agent_observability | none | |
| autonomous_analyst | none | |
| client_side_zero_server | full | core differentiator; DevTools-verifiable 0 network requests; RAM byte-wipe (Uint8Array.fill(0)) |
| local_on_device_ml | full | WASM engines incl. libsodium crypto + Tesseract OCR + optional NER model |
| saas_multitenant_cloud | none | deliberately absent |
| vpc_self_hosted | none | n/a (client-side) |
| air_gapped_onprem | full | airplane-mode verified; Enterprise on-prem w/ source escrow |
| open_source_components | none | proprietary engine |
| hipaa_mapping | full | §164.514 Safe Harbor, 18 identifiers |
| gdpr_mapping | full | Art. 25 & 32 |
| soc2_iso_certifications | partial | SOC 2 Type II *supporting controls* positioning (no vendor cert claimed) |
| eu_ai_act_mapping | full | Art. 50 transparency guide; Aug 2026 readiness page |
| nist_owasp_frameworks | partial | NIST SP 800-53 PT-2/PT-3 mapping |
| transparent_pricing | full | Free / $15 PRO ($110 lifetime) / $99 Teams flat unlimited seats / $299 SDK / OEM from $599 mo |
| free_tier_or_trial | full | generous free web tier |
| named_enterprise_customers | partial | anonymized testimonials (Velo Financial CISO, fintech/healthcare SaaS) |
| partner_program | none | direct sales |

**Proof points:** Zenodo DOI 10.5281/zenodo.22058770 (ZTDS architecture), OSF latency benchmark (<2 ms vs ~250 ms cloud proxy), SSRN EU-AI-Act legal treatise, 5.0★ Chrome Web Store, 10k+ users claim.
**Crypto:** XChaCha20-Poly1305 + Argon2id team handoff; Ed25519 offline license tokens; closed Shadow DOM sandboxing.

---

## AI-Protect

**URL:** https://ai-protect.store/ · **Cluster:** client-anonymization → governance layer · **Type:** own product

> ⚠️ Site is JS-rendered — plain HTTP fetch returns only `<title>` ("AI-PROTECT | Shadow AI stoppen & Datenverlust verhindern"). Profile seeded from Obsidian vault strategy docs. Items marked [TO VERIFY] must be confirmed against a rendered site capture or internal docs.

**Positioning (evolution per strategy log):**
"Sovereign Browser AI" → **"Liability Shield"** (post EU-AI-Act enforcement May 2026) → **"Compliance Engine"** (auto-tags local AI usage by EU AI Act risk tiers) → **"Closing the Browser Blind Spot"** → **"Productivity Governance Layer"** (category counter-position vs. LayerX Security's "AI Extension Security Platform" lists) → **Operational Telemetry / Active Defense**.

### Feature set (from strategy docs [TO VERIFY against current site])

| Dimension | Value | Notes |
|---|---|---|
| shadow_ai_tool_discovery | full | core promise: make Shadow AI visible to the CISO (DACH/KRITIS focus) |
| browser_extension_coverage | full | browser-level governance layer is the delivery vehicle |
| operational_telemetry | full | telemetry-based automated risk control (2026-06-28 pivot) |
| eu_ai_act_mapping | full | auto risk-tier classification of local AI usage → CISO reporting |
| audit_trail_receipts | full | mandatory audit trail for local AI usage ("liability shield") |
| policy_engine | full | thin governance layer between forbidden Shadow AI and overpriced enterprise AI |
| admin_lock_mdm | partial | [TO VERIFY] |
| pii/tokenization features | partial | [TO VERIFY] relationship/division of labor vs PrivacyScrubber engine |
| runtime agent guardrails | partial | "Active Defense / AI-native data protection" pivot 2026-06-29 [TO VERIFY scope] |
| gdpr/eu compliance narrative | full | DACH KRITIS orientation, data residency, German-language GTM |

### Go-to-market facts

- **EVN Model reference case:** unmanaged private AI tools at browser level → 10x productivity without enterprise licensing friction; used as "Golden Sample" for KRITIS (critical-infrastructure) entities in DACH.
- **Partner tiers:** Tier 1 resellers (lead gen) → Tier 2 IT consultancies → Tier 3 deep integrators (Cancom as distribution vehicle, explicitly *not* competitor).
- **Category war:** LayerX Security defines competing category lists ("Top 9 AI Extension Security Platforms"); QuantumRun market-share tracking active; Mindgard benchmarking 27 vendors.
- **Known blind spot:** exact current site feature matrix unverifiable via plain fetch — refresh requires rendered capture or owner input.
