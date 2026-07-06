# Dry-run result

Status: PASS (expected fail-closed rejection).

The real protected config, generated payload, and unsigned request were supplied to the
dry-run utility. Exit code was `2`: persistent canonical write remains disabled, so the
write gate denied the request. Independent checks already established schema/hash
validity and unsigned-signature rejection. Before/after record counts were identical at
zero for both roots; no registry file was created.
