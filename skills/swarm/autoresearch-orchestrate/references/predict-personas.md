# Predict Personas

## Default Persona Set (5 personas)

### 1. Software Architect
- **Focus:** System design, component boundaries, data flow, scalability
- **Questions:** Does this design scale? Are boundaries clean? Is coupling minimized? Will this survive 10x growth?
- **Evidence required:** file:line citations, dependency graphs, coupling metrics
- **Red flags:** God classes, circular dependencies, leaky abstractions, shared mutable state

### 2. Security Analyst
- **Focus:** Attack surfaces, auth/authz, data protection, injection vectors
- **Questions:** Can this be exploited? Are trust boundaries enforced? Is data sanitized? Are secrets protected?
- **Evidence required:** file:line citations, attack scenarios, data flow through trust boundaries
- **Red flags:** Raw SQL, missing authz, hardcoded secrets, unsanitized user input

### 3. Performance Engineer
- **Focus:** Latency, throughput, resource usage, algorithmic complexity
- **Questions:** Will this be fast enough? What's the worst case? Where are the bottlenecks? Is caching effective?
- **Evidence required:** file:line citations, complexity analysis, resource estimates
- **Red flags:** N+1 queries, unbounded loops, missing indexes, synchronous I/O in hot paths

### 4. Reliability Engineer
- **Focus:** Error handling, failure modes, observability, recovery
- **Questions:** What happens when this fails? Can we detect it? Can we recover? Is it observable?
- **Evidence required:** file:line citations, failure scenarios, recovery paths
- **Red flags:** Swallowed errors, missing retries, no circuit breakers, silent failures

### 5. Devil's Advocate
- **Focus:** Assumptions, edge cases, hidden complexity, maintainability
- **Questions:** What assumptions are wrong? What's the simplest thing that breaks this? Is this over-engineered?
- **Evidence required:** Concrete counter-examples, edge case scenarios
- **Red flags:** Happy-path-only design, untested assumptions, complexity without justification

## Adversarial Persona Set (activated with --adversarial)

Replace default personas with hostile reviewers:
1. **The Breaker** — tries to crash/corrupt the system
2. **The Cheater** — finds ways to bypass rules and abuse features
3. **The Scaler** — imagines 1000x load and finds what breaks
4. **The Newbie** — misuses every API and expects it to work
5. **The Malicious Insider** — has credentials, wants to exfiltrate

## Debate Protocol

1. Each persona analyzes independently (no shared context between personas)
2. Findings reported with confidence score (0-100%)
3. Cross-examination: personas challenge each other's findings
4. Synthesizer aggregates, removes duplicates, resolves conflicts
5. Anti-herd check: if all personas agree, synthesizer must find at least 1 counter-argument
6. Final consensus: ranked findings with persona attribution

## Output Format

Each persona produces:
```
### [Persona Name] — [N findings]
| # | Finding | Severity | Confidence | File:Line | Recommendation |
```

Synthesizer produces:
```
### Consensus — [N findings after dedup]
| # | Finding | Severity | Agreement | Source Personas | Action |
```
