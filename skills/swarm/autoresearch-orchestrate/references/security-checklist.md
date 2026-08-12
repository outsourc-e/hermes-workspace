# Security Audit Checklist

## STRIDE Threat Categories

| Category | Threat | Look For |
|---|---|---|
| Spoofing | Identity impersonation | Weak auth, token prediction, session fixation |
| Tampering | Data modification | Unvalidated input, missing integrity checks, SQL injection |
| Repudiation | Deniable actions | Missing audit logs, unsigned transactions |
| Info Disclosure | Data leaks | Error messages with stack traces, verbose logging, exposed env vars |
| Denial of Service | Availability attacks | Unbounded queries, missing rate limits, regex DoS |
| Elevation of Privilege | Unauthorized access | Missing authz checks, IDOR, privilege escalation paths |

## OWASP Top 10 (2021) Checklist

| # | Category | Key Checks |
|---|---|---|
| A01 | Broken Access Control | IDOR, missing function-level authz, CORS misconfiguration, path traversal |
| A02 | Cryptographic Failures | Plaintext secrets, weak algorithms, missing TLS, hardcoded keys |
| A03 | Injection | SQL, NoSQL, OS command, LDAP, XSS (stored/reflected/DOM) |
| A04 | Insecure Design | Missing threat model, no rate limiting, no abuse prevention |
| A05 | Security Misconfiguration | Default credentials, unnecessary features enabled, missing headers |
| A06 | Vulnerable Components | Known CVEs in dependencies, outdated packages, unmaintained libs |
| A07 | Auth Failures | Credential stuffing, brute force, weak passwords, missing MFA |
| A08 | Data Integrity Failures | Unsigned updates, insecure deserialization, CI/CD poisoning |
| A09 | Logging Failures | Missing security events, insufficient monitoring, no alerting |
| A10 | SSRF | Unvalidated URLs, internal service access, cloud metadata exposure |

## Red-Team Personas

| Persona | Focus | Mindset |
|---|---|---|
| Security Adversary | Auth, crypto, injection | External attacker with browser + Burp Suite |
| Supply Chain Attacker | Dependencies, CI/CD, build pipeline | Compromise through third-party code |
| Insider Threat | Data access, privilege abuse, exfiltration | Authenticated user with malicious intent |
| Infrastructure Attacker | Network, cloud config, containers | Target infrastructure misconfigurations |

## Severity Classification

| Severity | Criteria | Examples |
|---|---|---|
| Critical | Remote exploitation, no auth required, data breach | RCE, SQL injection, auth bypass |
| High | Requires some access, significant impact | Stored XSS, IDOR, privilege escalation |
| Medium | Limited impact or requires interaction | CSRF, reflected XSS, info disclosure |
| Low | Minimal impact, informational | Missing headers, verbose errors |
| Info | Best practice recommendation | Hardening suggestions, defense in depth |

## Composite Metric Formula

```
score = (owasp_categories_tested / 10) * 50
      + (stride_categories_tested / 6) * 30
      + min(unique_findings, 20)
```

Higher is better. Perfect score = 100 (all OWASP tested + all STRIDE tested + 20 findings).

## Coverage Tracking

Print coverage summary every 5 iterations:
```
OWASP: [A01✓ A02✓ A03✗ A04✗ A05✓ A06✗ A07✓ A08✗ A09✗ A10✗] 4/10
STRIDE: [S✓ T✓ R✗ I✓ D✗ E✗] 3/6
Score: 48.3 | Findings: 7
```

## Finding Format

Every finding requires:
1. **Title** — one-line summary
2. **Severity** — Critical/High/Medium/Low/Info
3. **OWASP** — A01-A10 category
4. **STRIDE** — S/T/R/I/D/E category
5. **Evidence** — file:line + attack scenario (no theoretical fluff)
6. **Reproduction** — steps to trigger
7. **Mitigation** — concrete fix recommendation
