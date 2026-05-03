## SDD-AI — test execution defaults

These rules align with **`METHODOLOGY-CONTRACT.md` §3–§3.1** shipped with SDD-AI (`refacil-prereqs` in your skills install). **Concrete baseline and narrowed commands for this repo** belong in markdown **below** this marked block (not between the `refacil-sdd-ai:testing-policy` markers) so `check-update` can refresh policy text without erasing your commands.

- **Default: scoped runs** — For `/refacil:apply`, `/refacil:bug` (fix), `/refacil:test`, and `/refacil:verify`, narrow the test runner to **packages/paths/modules touched by the change** (paths after `--`, `-p`/`-pl`, `-Dtest=…`, `pytest` paths, `go test ./…`, workspace filters, etc.). Prefer the **smallest** scope that still covers the diff. Avoid monorepo root commands that fan out to **all** workspaces unless the change truly spans them.
- **Full suite** — Only when the developer **explicitly** asks (`full`, `whole suite`, `suite completa`, …), in **CI / pre-merge**, or when narrowing is **unsafe** (then run baseline **once** with a clear WARN). Full runs cost more CPU/RAM.
- **Tests to add or change** — Keep them **next to** the behavior under change (follow this repo’s layout). Do not run unrelated suites “to be safe”.
