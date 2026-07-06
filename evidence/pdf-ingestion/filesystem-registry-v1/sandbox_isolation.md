# Sandbox isolation

PASS: configuration requires distinct absolute roots and namespaces. Tests use only
`tempfile.TemporaryDirectory`. Adapter selection is explicit. Production target is denied
before root preparation; no approved runtime root was created or accessed.
