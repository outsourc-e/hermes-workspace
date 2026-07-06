# Config validation

Status: PASS.

All nine required variables were reported `SET`; no values were emitted. Registry type
is filesystem, roots match the Founder-approved external paths, namespaces are distinct,
canonical write is `false`, dry-run is `true`, and kill switch is `false`. The protected
config was installed with a same-directory temporary file and atomic rename.

The HMAC key was rotated with `openssl rand -hex 32` under `umask 077`, stored separately,
and read into the config only inside a process with xtrace disabled. No key value, length,
prefix, suffix, or hash was emitted.
