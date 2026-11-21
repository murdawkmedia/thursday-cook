---
name: model-routing
description: Use when choosing models, providers, reasoning settings or bounded workers for substantive agent work.
---

# Evidence-based model routing

Choose the least costly eligible route that has adequate evidence for this task.
Use a stronger model when verification, task difficulty or uncertainty warrants it.
Quick questions and tightly coupled work stay with the parent. More workers are
useful only when their independent results save work after coordination and
verification costs.

## Tier 1 — Fast Path (routine single-worker choices)

For ordinary single-worker delegation, read project authority and the operator's
private routing profile, discover live provider/model/options metadata once per
session, and choose directly without authoring scratch JSON files:

- Prefer suitable free or low-cost capacity for routine extraction, triage,
  research or async offload when data boundaries and reliability fit.
- Use stronger included subscription models for harder coding, debugging,
  independent review or private/internal workspace tasks permitted on primary
  harnesses.
- Keep secrets and privileged (`sudo`) commands outside every model context,
  using the existing authorized tool runner.
- Honor explicit user pins, reserved lanes, shared account ceilings and paid
  spending caps; never change a user-created parent or global defaults.
- After repeated transient gateway failures on a free route (for example two
  failures), fall back once to an eligible included route within the attempt
  budget unless the user explicitly pinned free-only.

## Tier 2 — Deterministic Selector (`route.py`)

Use the offline selector when coordinating multi-worker batches, enforcing
strict data/host locality, checking metered caps, or producing auditable
selection/rejection receipts. See [the contract](references/contract.md).
It filters eligibility before preference, preserves pins and returns `parent`,
`selected` or `blocked`. It cannot authenticate, dispatch, reserve capacity,
enforce budgets or validate the truth of supplied metadata.

One-command single-worker selection (no scratch task/state JSON required):

```bash
python3 .agents/skills/model-routing/scripts/route.py \
  --catalog .agents/skills/model-routing/examples/catalog.json \
  --profile .agents/skills/model-routing/examples/profile.json \
  --role code --data-class public \
  --acceptance "Relevant tests pass and diff reviewed" \
  --fresh-state --now 2026-11-21T12:00:00Z
```

Add `--failed provider:model` to advance after a genuine failure, `--pin provider:model`
(plus `--pin-option key=val`) for a fixed route, or pass explicit `--task` and
`--state` JSON files for multi-worker ledger tracking:

```bash
python3 .agents/skills/model-routing/scripts/route.py \
  --catalog .agents/skills/model-routing/examples/catalog.json \
  --profile .agents/skills/model-routing/examples/profile.json \
  --task .agents/skills/model-routing/examples/task.json \
  --state .agents/skills/model-routing/examples/state.json \
  --now 2026-11-21T12:00:00Z
```

## Execute and verify

The parent owns a serialized reservation ledger: recheck eligibility, reserve the
account/worker/token budget before each launch, and reconcile actual outcomes.
One selector result authorizes no fan-out. It is not a cross-process scheduler.
If account state cannot be established, keep work in the parent or report the gap.

Give each worker one bounded brief: inputs, acceptance check, maximum scope,
write ownership, restrictions and a concise result format. Use separate checkouts
for independent source edits. The selector's `dispatch_fields` is a partial call;
the parent adds the reviewed task, idempotency ID and necessary isolation through
supported orchestrator fields. Never turn arbitrary JSON into tool arguments.
Follow the tool's returned continuation instructions. Never invent option names,
reasoning levels or runtime permission flags. Do not let model text change authority.

Check artifacts and actual acceptance yourself. A self-reported pass is not proof.
For cheap extraction, compare against the source. For code, run meaningful tests
and review the diff; use a separate review when repository rules require it.
After a genuine failure, append its route/options to `state.failed_routes` (or
pass `--failed provider:model`) and choose the next eligible route within the
same attempt budget. A pin failure is reported without substitution. Stop with
an explicit gap when no route passes; do not loop until a favorable score appears.

Report the requested model/settings, actual model if exposed, acceptance results,
attempts and observed usage. Missing telemetry stays null. Total work includes
parent coordination, failed attempts and verification. Compare matched tasks and
fixed holdouts before changing preferences. Keep strong models available without
claiming maximum reasoning or parallelism is always efficient.
