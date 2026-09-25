+++
id = "cache-tokens"
title = "Cache auth tokens"
bucket = "now"
rank = 1
filed = 2026-08-01
gate = "p99 login under 50ms"

[refs]
files = ["src/app.py"]
specs = ["auth"]
+++

Every request re-validates its token. See [the rotation question](rotate-keys.md).
