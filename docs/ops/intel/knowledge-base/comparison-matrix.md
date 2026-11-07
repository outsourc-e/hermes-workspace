# Comparison Matrix — AI Data & Agent Security Landscape
version: 1
updated: 2026-09-14
basis: "Frontmatter feature maps in vendors/*.md + own-products.md; value scale per taxonomy.yaml"

Legend: ● full · ◐ partial · ○ none/absent · ? unverified claim · n/a not applicable to architecture

## Group: Client-side architecture & anonymization

| Dimension | **AI-Protect** (own) | **PrivacyScrubber** (own) | Protecto | Straiker | Harmonic Security | Nightfall AI | TrueFoundry |
|---|---|---|---|---|---|---|---|
| Client-side zero-server | ◐ [TV] | ● | ○ | ○ | ◐ | ○ | ○ |
| Local on-device ML | ? | ● | ○ | ○ | ● (SLM endpoint) | ○ | ○ |
| Deterministic regex engine | ? | ● (<2 ms) | ○ | ○ | ○ | ○ | ○ |
| PII detection breadth | ◐ [TV] | ● (18 core + 25 profiles) | ● (200+ types) | ◐ | ◐ | ● (100+ detectors) | ○ |
| Context-preserving tokenization | ? | ● (token labels) | ● (RARI) | ○ | ○ | ○ | ○ |
| Reversible local reveal | ? | ● | ● (permissioned unmask) | ○ | ○ | ○ | ○ |
| Inline real-time redaction | ◐ [TV] | ● (in-DOM, typing) | ● (API-time) | ○ | ● (endpoint SLM) | ◐ (interaction time) | ○ |
| File/document sanitization incl. OCR | ? | ● (PDF/DOCX/XLSX/CSV, WASM OCR) | ◐ | ○ | ○ | ◐ | ○ |

## Group: Shadow-AI discovery & inventory

| Dimension | AI-Protect | PrivacyScrubber | Protecto | Straiker | Harmonic Security | Nightfall AI | TrueFoundry |
|---|---|---|---|---|---|---|---|
| Shadow-AI tool discovery | ● [TV] | ○ | ◐ | ◐ | ● (core) | ● | ○ |
| Per-tool risk profiles (training/HQ) | ? | ○ | ○ | ◐ | ● | ◐ | ○ |
| AI agent inventory | ◐ [TV] | ○ | ◐ | ● (Agent-SPM) | ◐ | ◐ | ◐ |
| MCP server discovery | ? | ○ | ◐ | ● (+ Claude Skills) | ○ | ● (local stdio too) | ◐ |

## Group: Agent runtime security

| Dimension | AI-Protect | PrivacyScrubber | Protecto | Straiker | Harmonic Security | Nightfall AI | TrueFoundry |
|---|---|---|---|---|---|---|---|
| Runtime guardrails (injection/leakage) | ◐ [TV] | ◐ (pre-submission only) | ● | ● (Defend) | ◐ | ● | ◐ |
| Hooks-level interception (coding agents) | ? | ○ | ○ | ? | ○ | ● (flagship demo) | ○ |
| Tool-call governance | ? | ○ | ● | ● | ○ | ● | ◐ |
| MCP gateway security | ? | ◐ (ships MCP server) | ◐ | ● | ○ | ● | ● |
| Agent red-teaming | ○ | ○ | ○ | ● (Ascend) | ○ | ○ | ○ |
| Autonomous analyst agent | ○ | ○ | ○ | ○ | ○ | ○ | ● (Nyx) |

## Group: Governance & compliance

| Dimension | AI-Protect | PrivacyScrubber | Protecto | Straiker | Harmonic Security | Nightfall AI | TrueFoundry |
|---|---|---|---|---|---|---|---|
| Policy engine / admin lock | ● [TV] | ◐/● (Blueprints + CISO lock) | ● | ◐ | ● | ● | ● |
| Audit trail / receipts | ● [TV] | ● (signed SHA-256 PDFs) | ● | ◐ | ◐ | ● | ● |
| HIPAA mapping | ? | ● (Safe Harbor §164.514) | ● | ○ | ◐ | ◐ | ◐ |
| GDPR mapping | ● | ● | ● | ○ | ◐ | ◐ | ◐ |
| SOC 2 / ISO certs | ? | ◐ | ● | ● | ? | ● | ● |
| EU AI Act mapping | ● (compliance engine thesis) | ● (Art. 50 guide) | ? | ● (dedicated page) | ? | ○ | ? |
| Air-gapped / on-prem | ? | ● (client-side = inherent) | ● | ? | ? | ○ | ● |
| Open-source components | ○ | ○ | ○ | ○ | ○ | ○ | ● (TrueForge et_al.) |

## Commercial snapshot (2026-09-14)

| Vendor | Pricing transparency | Self-serve start | Named customers | Channel program |
|---|---|---|---|---|
| PrivacyScrubber | ● $0/$15/$99/$299+ | ● free tier | ◐ testimonials | ○ |
| AI-Protect | ? [TV] | ? | ● EVN (KRITIS) | ● 3-tier model |
| Protecto | ○ demo-led | ● trial API | ● Inovalon, AA, Dell… | ◐ |
| Straiker | ○ demo-led | ● free assessment | ◐ | ● partners page |
| Harmonic | ● page exists [TV values] | ◐ demo | ● Advisor360, MPS | ● |
| Nightfall | ● pricing + ROI calc | ◐ | ● Snyk, Unit21… | ● |
| TrueFoundry | ◐ detailed page exists | ● live sandbox | ● NetApp, Cargill… | ● AWS/Azure/GCP |

[TV] = seeded from vault docs; site JS-rendered, verify on rendered capture.

## Strategic read (auto-summary)

1. **Whitespace confirmed:** nobody combines zero-server client-side anonymization with agent-runtime enforcement. Two halves exist separately (PrivacyScrubber ←→ Nightfall/Straiker).
2. **Convergence threat:** Harmonic's endpoint-SLM inline redaction is the nearest neighbor to PrivacyScrubber's core; Nightfall is moving into coding-agent hooks fastest.
3. **Underserved geography:** no competitor leads with EU AI Act operationalization + data sovereignty for DACH/KRITIS; AI-Protect's compliance-engine positioning remains differentiated.
4. **Partner signal:** TrueFoundry (gateway infra, vendor-neutral, air-gapped) is the most plausible embed/integration partner for a sanitize-at-the-gateway story.
