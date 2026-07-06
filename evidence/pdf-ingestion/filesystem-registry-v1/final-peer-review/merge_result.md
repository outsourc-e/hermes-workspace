# Merge Result

- Command: git merge --no-ff fix/captain-pdf-secure-handoff -m "merge: governed filesystem registry v1"
- Merge commit: 316bded0 on main in /tmp/captain-pdf-integration
- Strategy: ort, zero conflicts
- Diff main-before (a036b792)..merge: 47 files, +1829/-0, all additions, all under
  evidence/pdf-ingestion/{fable5-closeout/handoff, filesystem-registry-v1} — no unrelated scope
- Post-merge git status: clean
- Targeted tests (run_targeted_tests.sh in integration worktree): JSON schema parse, py_compile,
  22/22 unit tests, 15/15 secure-handoff tests, guard greps — FILESYSTEM_REGISTRY_TARGETED_TESTS_PASS
- Full test suite: not run (out of scope per handoff)
- Canary: not re-run (prohibited)
- Untracked leftovers intentionally NOT merged/staged: founder-provision/, sandbox-canary/ (superseded by
  sandbox-canary-agy; not authorized for staging in this handoff)
