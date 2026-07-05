# Atomic write test

PASS: same-directory temporary creation, file `fsync`, atomic `os.replace`, directory
`fsync`, checksum sidecar, read-back, and temporary cleanup on interruption. Disk-full is
simulated and does not publish a record. Recovery removes abandoned temporary files.
