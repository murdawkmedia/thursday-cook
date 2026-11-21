# Selector contract, version 1

Python 3 standard library only. `scripts/route.py` reads local JSON inputs
(or inline CLI task flags plus `--fresh-state` for single-worker selection);
it has no network, authentication, subprocess or write path. Exit codes: 0 for
`parent`/`selected`, 2 for invalid inputs, 3 for a valid blocked decision.
Duplicate JSON keys, unknown/missing fields, nonfinite numbers, wrong types and
duplicate routes fail. Work input/output estimates must be positive integers.
The examples give the complete required fields; timestamps need a timezone.

`catalog.models` entries identify an exact provider instance/model and shared
account group. Capability limits are integers or null. `tools` may be null.
`output_tokens: null` is permitted for non-metered (`free`/`subscription`)
routes when `context_tokens` covers the requested input plus output tokens, and
sets `output_limit_unverified=true` in the returned decision; metered routes
still require a verified non-null `output_tokens` cap. `enabled` and
`available` are explicit booleans; metadata presence alone is not a health test. `options` maps the orchestrator's exact field names to allowed string
or boolean values. Unknown billing cannot dispatch. `subscription` means current
included entitlement has been verified, not merely that the model is in a menu.
`upper_bound_usd` and `spend_cap_enforced=true` are needed for authorized metered
routes: an independent runner must enforce the declared bound for the entire
attempt, including tools. Never set that flag from an advisory prompt limit.
USD values have at most six decimal places and range from zero to one million;
the metered attempt bound must be positive. Fractional JSON numbers are parsed
as decimals before validation. Reservation output preserves this bounded precision.

`evidence` is an array of records: `role`, `level`, `observed_at`, `options`.
Levels increase from `metadata` to `smoke` to `role-validated`. Each record covers
only that role, date and exact option dictionary. `{}` covers default settings;
the explicit `{}` in the dispatch resets inherited T3 options to model defaults.
A hash/extraction smoke is not coding or security validation. Different roles and
variants need separate records. No score implies universal correctness. Support
dates/settings with private receipts. Catalog freshness is capped at seven days;
role evidence freshness at one year. Operators should choose shorter windows.

`profile.role_preferences` is an ordered list per role. It is operator policy,
not model output. It may favor a stronger included model for difficult work and
free capacity for routine work. `reserved_routes` excludes model prefixes on
exact provider instances. The caller chooses a conservative concurrency ceiling
per shared account; it is not a claim about the provider's published allowance.
`profile.data_policy` is an explicit per-provider allowlist of `data_classes`
and `localities`, intersected with each curated catalog entry. Discovery cannot
expand that policy. Unknown locality is ineligible. Reserved work uses its own
authorized profile; a pin does not override reservations.

`state.workers` counts active workers for this job; `attempts` counts launches
already used. `requested_tokens` counts previously reserved input/output estimates.
`spent_usd` must include active paid reservations as well as completed charges.
Both the state and every selected account's `observed_at` must be within five
minutes of selection. `failed_routes` retains failed exact route/option pairs;
attempt bookkeeping cannot repeatedly choose the same failed pair.
Account `throttled=false` means no known denial, not unlimited remaining quota.
The caller coordinates all consumers it controls; unknown external usage remains
an uncertainty and observed denials end that account's attempts.
Map known nested/shared limits conservatively to one shared group; this version
does not coordinate distributed quota, discover account topology or provide locks.

`task.required_host` requires verified `local` inference on that exact host.
Such routes also need a catalog `environment_id`; the dispatch binds it as
`target.environmentId`. The inference host and executor environment are different
facts, both verified by the caller. `input_modalities` must all be supported.
Data-class permissions are explicit profile/operator decisions; they cannot be
inferred from locality. Secrets and sudo tasks always return the authorized-tool
boundary. The selector handles declared metadata, not payload inspection.
The parent must redact and review the actual outgoing prompt.

`task.pin` restricts selection to one exact route and options. No substitution.
Unpinned routes follow the role preference order, with all failed eligibility
reasons retained. A selected result contains only T3 target provider/model/options,
mapped T3 `role` (`code`/`implementation`→`implementation`, `review`→`review`,
`research`→`research`, `design`/`plan`→`design`, `test`→`test`, others→`general`),
`mode=async`, acceptance checks and advisory bookkeeping including
`billing`, `reserved_usd` and `output_limit_unverified`. Reserve the latter before metered execution; its
positive bound applies to the complete attempt. No T3 spend cap is supplied by
this selector: without an independently verified enforcer the flag stays false
and metered routes remain blocked. Add no unsupported tool arguments.
Output is a proposal to the authorized parent, not execution enforcement.

Run tests: `python3 -m unittest discover -s .agents/skills/model-routing/tests -v`.
Synthetic examples have no live credentials, provider endpoints or account data.
