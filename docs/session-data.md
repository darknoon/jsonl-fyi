# Session data: what may be committed

This repository is public. Reading real sessions locally is fine; putting
anything from them in the repo is not, unless it is on the allowed list.
"Anything" includes prose: a format doc, spec, fixture README or test name
can disclose a session as completely as the session file can.

Allowed, in order of preference. Real sessions come first because
hand-written ones miss the quirks that cause real rendering bugs.

1. **Andrew's own sessions working on jsonl-fyi**, under their original
   filename, only after Andrew approves that file. Check it first for
   secrets and for content pulled in from other projects.
2. **A session recorded for the fixture**: run the harness on a throwaway
   or public project with nothing private in it, so the data is real but
   has nothing to disclose. Ask Andrew before running a harness for this.
3. **Sessions that are already public**, or that their author supplied for
   this purpose (for example attached to a GitHub issue), with the source
   noted.
4. **Synthetic sessions**, only when none of the above can cover the case,
   such as a format seen only in private samples or a failure you cannot
   reproduce. Follow the real format's field shapes, ordering and odd cases
   closely, and say it is synthetic in a README beside it, like
   `src/__fixtures__/grok/recipe-planner/README.md`.

Not allowed, in any form:

- Sessions from paid or company work: evaluations, benchmark runs, client
  projects, or anything from another project's bb thread storage
  (`~/.bb/thread-storage/`). A clean credential scan does not make a
  session publishable, and a trimmed or redacted one is still that session.
- Sessions from Andrew's other projects.
- Where a sample came from: the agent or model being evaluated, benchmark,
  dataset, task or client names, per-sample counts and statistics, run
  dates, local paths and thread ids.

"In any form" covers fixtures, `docs/research/` notes, specs and plans,
fixture READMEs, test names and strings, scripts and their default paths,
example sessions in `src/examples.ts`, commit messages, PR titles,
descriptions and comments, and PR screenshots.

When private sessions taught you a format:

- Document structure only: record and field names, types, enum values and
  how records join. Every example is invented.
- Do not describe the samples themselves, not even "one private benchmark
  run". Keep provenance notes and audit output in thread storage.
- For the fixture, prefer a session recorded with the same harness on a
  throwaway project. Otherwise write one by hand that keeps the real
  structure but none of the samples' prompts, subjects, file names or
  identifiers.
- Ask Andrew to read the docs, fixture and PR text before the first push.
  Then search the diff for paths and thread ids, and for every model,
  benchmark, task and client name in your brief or the samples:

  ```sh
  git diff origin/main... | grep -nE '/Users/|/home/|thread-storage|thr_[a-z0-9]{10}'
  ```

A pushed commit cannot be fully withdrawn. GitHub keeps it reachable by
hash until GitHub Support purges it, and PR description edits keep their
history. When unsure, ask before committing.
