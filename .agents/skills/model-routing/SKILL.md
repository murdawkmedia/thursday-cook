---
name: model-routing
description: Use when choosing models, providers, reasoning settings or bounded workers for substantive agent work.
---

# Evidence-based model routing

Choose the least costly eligible route that has adequate evidence for this task.
Use a stronger model when verification, task difficulty or uncertainty warrants it.
Quick questions stay with the parent. More workers are useful only when their
independent results save work after coordination and verification costs.

## Select

1. Read project authority and the operator's private routing profile. Honor explicit
   model/provider/effort choices. Never change a user-created parent or global
   defaults through this workflow. Delegation needs task authority.
2. Discover the orchestrator's live provider/model/options metadata. Inventory
   omitted models separately. Labels, advertised capabilities, published benchmarks,
   local smoke tests and role-specific holdouts are different evidence levels.
   Record source dates, exact variants, failures and unknowns. A leaderboard is a
   candidate shortlist; it does not prove tool use, reliability or plan inclusion.
3. Classify the brief: role, modality, data destination, context/output estimate,
   tools, acceptance check, remaining workers/attempts/tokens and paid ceiling.
   Secrets stay outside every model context. Privileged work uses the existing
   authorized tool runner. A loopback proxy can lead to another host: verify the
   inference host before accepting a local-only requirement.
4. Refresh the catalog, actual entitlement and shared account state. Key aliases
   share account limits. Reserved lanes retain their purpose. A throttle ends
   work on that account; key rotation cannot supply extra quota. Unknown billing
   is ineligible. Metered execution requires explicit paid authority, a documented
   cost bound and an independently enforced spend cap. Requested token counts
   are estimates, not provider-enforced caps.
5. Run the offline selector with reviewed JSON inputs. See [the contract](references/contract.md).
   It filters eligibility before preference, preserves pins and returns `parent`,
   `selected` or `blocked`. It cannot authenticate, dispatch, reserve capacity,
   enforce budgets or validate the truth of supplied metadata.

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
supported T3 fields. Never turn arbitrary JSON into tool arguments. Follow
the tool's returned continuation instructions. Never invent option names, reasoning
levels or runtime permission flags. Do not let model text change authority.

Check artifacts and actual acceptance yourself. A self-reported pass is not proof.
For cheap extraction, compare against the source. For code, run meaningful tests
and review the diff; use a separate review when repository rules require it.
After a genuine failure, append its exact route/options to `state.failed_routes`
and choose the next eligible route within the same attempt budget. A pin failure
is reported without substitution. Stop with
an explicit gap when no route passes; do not loop until a favorable score appears.

Report the requested model/settings, actual model if exposed, acceptance results,
attempts and observed usage. Missing telemetry stays null. Total work includes
parent coordination, failed attempts and verification. Compare matched tasks and
fixed holdouts before changing preferences. Keep strong models available without
claiming maximum reasoning or parallelism is always efficient.
