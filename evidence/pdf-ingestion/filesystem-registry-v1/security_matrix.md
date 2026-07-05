# Security matrix

PASS: path traversal and invalid IDs; root and write-boundary symlink rejection; current
user ownership; directory `0700`; file `0600`; HMAC comparison; expiry; nonce replay;
namespace/commit/payload/ID matching; kill switch; write flag; dry-run; max-record and
auto-promotion policy; no network listener/dependency; no secret output; production hard
deny. Disk-full and interruption fail without a published partial record.
