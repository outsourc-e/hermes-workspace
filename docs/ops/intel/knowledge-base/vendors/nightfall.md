---
name: Nightfall
url: https://www.nightfall.ai/
type: competitor
cluster: data-control-plane
last_profiled: 2026-09-18
positioning: "AI-native DLP platform that prevents sensitive data exposure and exfiltration across SaaS, endpoints, email, browsers, and AI apps."
features:
  shadow_ai_tool_discovery: full
  ai_agent_inventory: partial
  mcp_server_discovery: full
  browser_extension_coverage: full
  endpoint_agent_coverage: full
  saas_api_integrations: full
  pii_detection_breadth: full
  deterministic_regex_engine: none
  ml_llm_detection: full
  context_preserving_tokenization: none
  reversible_reveal: none
  file_document_sanitization: full
  custom_rules_regex: none
  inline_realtime_redaction: full
  runtime_access_control: full
  policy_engine: full
  admin_lock_mdm: full
  audit_trail_receipts: full
  multi_tenancy: full
  agent_runtime_guardrails: full
  hooks_level_interception: full
  tool_call_governance: full
  mcp_gateway_security: full
  agent_red_teaming: none
  agent_observability: partial
  autonomous_analyst: none
  client_side_zero_server: none
  local_on_device_ml: full
  saas_multitenant_cloud: full
  vpc_self_hosted: unverified
  air_gapped_onprem: unverified
  open_source_components: none
  hipaa_mapping: full
  gdpr_mapping: full
  soc2_iso_certifications: full
  eu_ai_act_mapping: unverified
  nist_owasp_frameworks: unverified
  transparent_pricing: none
  free_tier_or_trial: full
  named_enterprise_customers: full
  partner_program: partial
---

# Nightfall — Deep-Dive Profile

## What they sell
AI-native Data Loss Prevention (DLP) platform. It provides real-time visibility and control over sensitive data movement across SaaS (Microsoft 365, Google Workspace, etc.), endpoints, email, browsers, and AI apps (ChatGPT, Claude, etc.).

## Core technological claims
1. **AI-powered Detection:** Uses 100+ AI-based models, LLM-based file classifiers, and Computer Vision models. Claims 95% accuracy (compared to 5-2/5% for legacy solutions).
2. **MCP Gateway:** A governed proxy layer that intercepts and enforces policy on tool calls across developer AI tools (Cursor, Claude Code, VS Code, Claude Cowork). Features: inline enforcement, credential brokering (per-tenant encryption), and "pruning" of high-risk tool calls (e.g., database drops).
3. **Data Lineage Tracking:** Uses AI-based lineage to trace information from source to destination, understanding risk based on context, not just patterns.
4. **File Classification:** LLM-powered classifiers identify sensitive document types (Financials, HR, Legal, etc.) based on structure and semantics.
5. **Endpoint & Browser Protection:** Lightweight agents/plugins for real-time interception and redaction of prompts and file uploads.
6. **CLI Data Transfer Protection:** Extends governance to command-line operations (curl, scp, wget, rsync, npm).
7. **MCP Server Visibility:** Automatically scores local/remote MCP servers.

## Deployment & integration
- **API-based SaaS Integrations:** Deploy in minutes via OAuth (Microsoft 365, Slack, Salesforce, etc.).
- **Endpoint/Browser:** Lightweight agents for macOS and Windows; browser plugins for Chrome, Edge, Firefox, Safari, and Chromium forks (Arc, Brave, Vivaldi, Comet).
- **Developer Tools:** Primary integration with Cursor, Claude Code, VS Code, and Claude Cowork via the MCP Gateway.

## Compliance posture
Focus on preventing leaks of PII, PHI, PCI, and secrets. HIPAA and GDPR compliance implied by feature set.

## Traction signals
- **Funding:** Series B, ~$60M total funding.
- **Customers/Partners:** Part of the broader ecosystem of enterprise security tools.

## Relevance to us (AI-Protect / PrivacyScintilla)
- **Direct Competitor (Endpoint/Gateway):** Their "MCP Gateway" and "Endpoint Agent" models for real-time redaction are direct functional competitors to PrivacyScrubber.
- **Direct Competitor (SaaS/API):** Their API-based SaaS integration competes with our SDK-based interception.
- **Strategic Threat:** Their move into "MCP Gateway" (interception at the tool-call level) is a high-value feature that directly overlaps with our agent-security roadmap.

### Sources
- https://www.nightfall.ai/ (homepage, fetched 2026-09-15)
- https://www.nightfall.ai/news/nightfall-launches-mcp-gateway-to-govern-ai-agents-before-they-act (news, fetched 2026-09-15)
