# Untracked Evidence Review (resume, 2026-07-06)

Review base 260f4022..014aac00 re-confirmed: 69d5ee3f = registry implementation commit,
014aac00 = AGY canary evidence commit; no intermediate evidence commits existed on the branch.

## founder-provision/ — verdict: SAFE_TO_COMMIT (committed)

- 6 reports + evidence.sha256; all checksums OK
- Unique audit-chain evidence for the provisioning step between the secure handoff (69d5ee3f)
  and the AGY canary (014aac00): protected config installed, HMAC key rotated under umask 077
  and never displayed, unsigned request validated then rejected by signature check, dry-run
  fail-closed, roots/permissions 0700/0600, production hard-deny exercised
- No secret values, no key material (no value, length, prefix, suffix, or hash emitted),
  no signed manifest, no runtime registry record
- Not duplicated by sandbox-canary-agy (which covers execution, not provisioning)
- Committed as 5676b3f3 on fix/captain-pdf-secure-handoff; merged to main as 556109c0

## sandbox-canary/ — verdict: DO_NOT_COMMIT (left untracked)

- 9 reports + evidence.sha256; all checksums OK; no secrets
- Records the PRE-provisioning canary attempt that correctly failed closed:
  final status HANDOFF_REQUIRED, 0 records, configuration and signed manifest absent
- Superseded by the canonical committed set sandbox-canary-agy (SANDBOX_CANARY_PASS 10/10);
  committing both would put contradictory final statuses side by side
- Decision per single-canonical-evidence rule: not staged, not committed; left untracked at
  /tmp/captain-pdf-cleanroom2 for Founder to archive outside Git or delete

This supersedes the note in merge_result.md that founder-provision was not staged.
