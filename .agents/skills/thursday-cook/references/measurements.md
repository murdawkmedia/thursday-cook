# Optional local measurements

Use measurements to test a claim, with a declared unit and observation window.
They do not authorize work or prove completion. The workflow works without the
optional CLI or a central registry.

- Record only complete observations for that window. Unknown counts stay null;
  an observed zero is0. Never estimate tokens from characters or source-file size.
- Include intentional failing tests in failed_check_runs, and record that subset
  in expected_red_runs. Keep infrastructure/fixture failures distinct in the
  private evidence so a red test is not mislabeled avoidable rework.
- Distinguish unit tests, actual consumer integration, deployment and acceptance.
  An unconnected core's tests do not establish an integrated feature.
- Keep synthetic examples marked synthetic_example. Real records may still have
  unknown fields. Shape validation does not authenticate measurements.
- If centralizing records, store only metrics plus minimal unit/date/window
  metadata in a chosen private home. Keep logs, notes and source at their projects.
  Deduplicate imports, preserve originals and label reconstructed windows
  retrospective. Incomplete logs stay at source without invented totals.
- Share only an explicitly authorized, separately inspected aggregate. Evidence
  and raw records stay private by default. No automatic collector or uploader.

The optional validator lives in the reviewed repository checkout, not in this
standalone skill folder. From that checkout, with Bun installed:

```sh
bun run scripts/feedback-record.ts --template
bun run scripts/feedback-record.ts --validate < reviewed-record.json
```

For a runtime invocation without Bun's transpiler cache, set
BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 for that process. This is independent of
whether the helper persists records; the helper never writes the submitted record.

See the public [schema and field guide](https://github.com/murdawkmedia/thursday-cook/blob/main/docs/feedback-record.md).
The fixed version1 contract bounds stdin at16KiB and rejects duplicate fields.
Savings claims require comparable tasks, observation methods, model and settings.
A single successful trial is not an efficiency benchmark.
