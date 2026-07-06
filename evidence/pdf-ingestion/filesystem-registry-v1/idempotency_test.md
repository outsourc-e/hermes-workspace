# Idempotency test

PASS: first create returns `CREATED`; identical replay returns `IDEMPOTENT`; one immutable
record remains. Conflicting payloads and reused nonces are denied. Concurrent attempts
are serialized by `flock` and produce one record.
