# Fixtures

Chat transcript fixtures are kept under their original on-disk filename
from whichever harness produced them (Claude in
`~/.claude/projects/<project>/`, Codex in `~/.codex/sessions/...`, Pi
exports, and so on), so it's clear where each one came from and which
session it corresponds to. Don't rename them to `*-sample.jsonl` or
other descriptive aliases.

This repository is public. Before adding a fixture, read "Session data:
what may be committed" in `AGENTS.md`; most real sessions may not be
committed, and synthetic ones are the default.
