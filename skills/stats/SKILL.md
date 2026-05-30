---
name: refacil:stats
description: Show statistics for a change — token savings, review history, compact and CodeGraph telemetry; optional narrative interpretation
user-invocable: true
---

# refacil:stats — Change Statistics

This skill is a **read-only utility** that surfaces observability data for a given change. It is optional — it does not block or affect any existing flow. Run it at any point to understand how a change is progressing or has progressed.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md`.

## Flow

### Step 1: Resolve change name

1. If `$ARGUMENTS` provides a change name, use it directly.
2. If not, run `refacil-sdd-ai sdd list --json` and use the single active change if there is only one.
2.5. If `sdd list --json` returns `[]` (no active changes), auto-select the most recent archived change:
   - Run `refacil-sdd-ai sdd list --include-archived --json`.
   - From the returned array, filter items where `archived` is `true`. Sort descending by `archivedDate` (tiebreak: name descending). Select the first item.
   - If an archived change is found: inform the user ("No active changes found — showing stats for most recently archived change: `<name>`") and continue to Step 2 with that `changeName`.
   - If no archived changes exist either: inform the user that there is no change history and stop.
3. If there are multiple active changes and no argument, ask the user to specify the change name. Do not proceed with ambiguous scope.

If the change name is given but not found in the active changes, do **not** suggest `/refacil:propose`. Instead:
1. Run `refacil-sdd-ai sdd list --include-archived --json` to check for archived changes.
2. If archived changes exist, show the list and ask the user to confirm which name they want to query (they may have misspelled or the change was already archived).
3. Only if there are no active **and** no archived changes should you inform the user that there is no work history for the given name.

### Step 2: Run the stats CLI command

Execute:

```bash
refacil-sdd-ai sdd stats <changeName> --json
```

If the command exits with code 1 (change not found or invalid name), show the CLI error message. The step 1 fallback (archived lookup) should have already been applied before reaching here, so a code 1 at this point means the name is genuinely absent in both active and archived locations — inform the user and stop.

### Step 3: Parse the JSON output

Parse the JSON block returned by the CLI. Expected fields:

```json
{
  "changeName": "<name>",
  "isArchived": true | false,
  "archivedDate": "<YYYY-MM-DD or null>",
  "startDate": "<ISO timestamp or null>",
  "memory": {
    "testCommand": "<command or null>",
    "lastStep": "<step or null>",
    "criteriaRun": ["CA-01", "CR-01", ...]
  },
  "review": {
    "passed": true | false,
    "verdict": "<verdict or null>",
    "date": "<ISO timestamp or null>",
    "failCount": <int>
  },
  "compact": {
    "eventsInPeriod": <int>,
    "rewrites": <int>,
    "estimatedTokensSavedByRewrites": <int>,
    "alreadyCompact": <int>,
    "estimatedTokensSavedAlreadyCompact": <int>
  },
  "codegraph": {
    "eventsInPeriod": <int>,
    "totalToolCalls": <int>,
    "estimatedTokensSaved": <int>
  }
}
```

If any field is null or 0, treat it as "no data" — do not error.

### Step 4: Show numbers (structured display)

Present the data in a readable format. If `isArchived` is `true`, add `[archivado el <archivedDate>]` to the header:

```
=== Stats: <changeName> [archivado el <archivedDate>] ===   ← only when isArchived: true
=== Stats: <changeName> ===                                 ← when isArchived: false

Phase progress
  Started:    <startDate or "unknown">
  Last step:  <lastStep or "not recorded">
  Criteria:   <criteriaRun list or "none">

Review
  Passed:     <yes/no>
  Verdict:    <verdict or "pending">
  Date:       <date or "—">
  Fail count: <failCount>

Token savings (change period)
  Compact rewrites:       <rewrites> events — ~<estimatedTokensSavedByRewrites> tokens saved
  Already compact:        <alreadyCompact> events — ~<estimatedTokensSavedAlreadyCompact> tokens (skill discipline)
  CodeGraph tool calls:   <totalToolCalls> — ~<estimatedTokensSaved> tokens saved
```

### Step 5: Narrative interpretation (anomaly detection)

After the numbers, add a brief narrative. Apply these heuristics:

**Anomalous passes**: if `review.passed` is `true` but `memory.criteriaRun` is empty or `memory.lastStep` is `apply` (no test phase recorded) — flag this:
```
Note: the change was reviewed but no test phase is recorded in memory. Recommend running /refacil:test before archiving.
```

**Token concentration**: if `compact.estimatedTokensSavedByRewrites` is 0 and `codegraph.estimatedTokensSaved` is also 0 — flag this:
```
Note: no token savings recorded for this change. Compact and CodeGraph telemetry may not be active.
```

**Comparison with previous changes** (optional — only if data exists):
- Read all other change directories under `refacil-sdd/changes/` that have `memory.yaml`.
- If at least 2 other changes have `criteriaRun` data, compute the average criteria count and compare:
  ```
  This change ran <N> criteria vs. an average of <avg> in previous changes.
  ```
- If no other changes have sufficient data, skip this comparison silently.

**No anomalies**: if none of the above apply, show:
```
No anomalies detected. The change looks healthy.
```

### Step 6: Next step (optional)

**Skip this step entirely if `isArchived === true`** — archived changes have no actionable next steps.

If `memory.lastStep` is `apply` (no test yet):
```
Recommended next step: /refacil:test
```

If `memory.lastStep` is `test` and `review.passed` is `false`:
```
Recommended next step: /refacil:verify
```

If `review.passed` is `true`:
```
The change is reviewed. Next step: /refacil:archive (if all tasks are done).
```

## Rules

- **This skill is read-only** — it does not modify any file, branch, or memory.
- **Does not block any flow** — absence of stats data is reported as zeros, not as an error.
- **Non-existent change**: exit with code 1 and a clear message (CA-12).
- **Missing data fields**: treat as zero or null — never throw; degrade gracefully.
- Comparison with previous changes is **optional** — only if data exists. Never block on its absence.
- This skill does not call any sub-agent — it is a direct CLI wrapper with narrative.
