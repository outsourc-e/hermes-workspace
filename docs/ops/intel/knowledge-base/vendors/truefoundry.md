---
name: TrueFoundry
url: https://www.truefoundry.com/
type: partner-candidate
cluster: gateway-infra
last_profiled: 2026-09-18
positioning: "The Enterprise AI Gateway for LLMs, MCPs & Agents — on-prem, VPC, hybrid, or public cloud"
features:
  shadow_ai_tool_discovery: none
  ai_agent_inventory: partial
  mcp_server_discovery: partial
  browser_extension_coverage: none
  endpoint_agent_coverage: none
  saas_api_integrations: full
  pii_detection_breadth: none
  deterministic_regex_engine: none
  ml_llm_detection: none
  context_preserving_tokenization: none
  reversible_reveal: none
  file_document_sanitization: none
  custom_rules_regex: none
  inline_realtime_redaction: none
  runtime_access_control: full
  policy_engine: full
  admin_lock_mdm: none
  audit_trail_receipts: full
  multi_tenancy: full
  agent_runtime_guardrails: partial
  hooks_level_interception: none
  tool_call_governance: partial
  mcp_gateway_security: full
  agent_red_teaming: none
  agent_observability: full
  autonomous_analyst: none
  client_side_zero_server: none
  local_on_device_ml: none
  saas_multitenant_cloud: full
  vpc_self_hosted: full
  air_gapped_onprem: full
  open_source_components: full
  hipaa_mapping: partial
  gdpr_mapping: partial
  soc2_iso_certifications: full
  eu_ai_act_mapping: unverified
  nist_owasp_frameworks: none
  transparent_pricing: partial
  free_tier_or_trial: full
  named_enterprise_customers: full
  partner_program: full
---

# TrueFoundry — Deep-Dive Profile

## What they sell (control-plane infrastructure, not endpoint security)
1. **AI Gateway** — unified model access: routing, fallbacks, rate limits, cost controls, end-to-end observability.
2. **MCP Gateway** — centralized MCP discovery, authentication, access control, auditability for agent↔tool traffic.
3. **Agent Gateway** — governed agent identity ("every agent a governed identity"), usage policies, end-to-end tracing.
4. **Prompt Management** + **Agent Skills Registry** + **AITori**.
5. **Deployment platform:** model serving, training/fine-tuning, unified AI deployments; **TrueForge** — open-source, vendor-neutral **agent harness**, claims "50% lower cost" and "up to 75% cheaper than Claude Managed Agents" (~2k GitHub stars).

## Architecture & governance
- Deploy anywhere: SaaS / customer VPC / on-prem / **air-gapped** / multi-cloud — "no data leaves your domain" sovereignty pitch.
- Observability: OpenTelemetry-compliant tracing (prompt → tool/model execution), Grafint/Datadog/Prometheus integration, GPU utilization analytics.
- Governance: SSO + RBAC, immutable audit logging, real-time guardrails (data residency, quotas, rate limits, cost), adaptive AI routing by cost/latency/task.
- Compliance badges: SOC 2, HIPAA, GDPR.

## Open-source ecosystem
KubeElasti, llm-locust (load testing), Cognita (RAG framework), CruiseKube. Compare pages vs Portkey, Kong, LiteLLM, Solo.io, SageMaker.

## Traction
- Customers/logos: NetApp (case study "scales AI agents across hundreds of users"), Cargill, Mavenir, Whatfix, Wadhwani AI, Aviva, JanitorAI, ResMed, **Automation Anywhere** (also a Protecto logo — shared account?), Siemens Healthineers, Innovaccer; **NEW logos on homepage (2026-09-18): NVIDIA, Games247.**
- **NEW award (2026-09-18): Frost & Sullivan "2026 Global Transformational Innovation Leader — enterprise AI control plane."**
- Claims: 80% GPU-utilization uplift, 50% cloud-spend reduction, <2 weeks migration.

## Relevance to us (AI-Protect / PrivacyScintilla)
- **Partner potential (strongest in the set):** their gateway is a natural embedding point for a PrivacyScrubber sanitization middleware (SDK as gateway guardrail plugin: mask-before-model at the proxy layer). They are vendor-neutral by positioning and ship an open-source harness — receptive to ecosystem integrations.
- **Watch item:** TrueForge commoditizes agent-harness infra that we might otherwise have considered building; do not build what TrueForge gives away.
- **No PII/tokenization capability of their own** → no direct product conflict today.

### Sources
- https://www.truefoundry.com/ (fetched 2026-09-18)
- https://www.truefoundry.com/blog/truefoundry-named-frost-sullivans-2026-global-transformational-innovation-leader-in-enterprise-ai-control-plane (Frost & Sullivan 2026 award, fetched 2026-09-18)
- https://github.com/truefoundry/trueforge (referenced banner, ~2k stars shown on site)
- https://www.truefoundry.com/case-study/netapp (hero reference)
