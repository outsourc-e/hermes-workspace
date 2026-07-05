# Production write guard

PASS: `FilesystemRegistry._gate` unconditionally returns `WRITE_DENIED` for production,
independent of flags. Test confirms the production root remains absent. Canonical write
was not enabled and production data was not read or modified.
