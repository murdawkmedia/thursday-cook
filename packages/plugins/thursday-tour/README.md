# thursday-tour

Ticket E14: the tutorial as a plugin, not a script for a model to follow.

The tour is a YAML list of steps (`data/steps.yaml`): display text, a CSS
selector for the target, a completion condition. No step logic lives in
prose. The host half owns the list, derives completion from real state
(ticket done, file exists, command ran — never an agent claim), keeps
durable progress on disk, and registers the `tour_status` agent tool. The
client half renders the panel into dsh's `shell.overlay` seat with a
four-rectangle spotlight and attempts the composer prefill.

## Layout

- `data/steps.yaml` — the single source: `tickets` (the plan ticket ids)
  plus the ordered `steps`.
- `src/steps.generated.ts` — checked-in output of `pnpm run steps`
  (do not hand-edit; the sync test fails if it drifts from the YAML).
- `src/steps.ts` — the step schema, the text cap, validation.
- `src/yaml.ts` — the strict-subset YAML reader the generator and the
  sync test share. It accepts exactly the shape `steps.yaml` is written
  in and throws on anything else; it is not a general YAML parser.
- `src/progress.ts` — the observable world, derived completion (claims
  are not an input), and the durable progress store.
- `src/tool.ts` — the `tour_status` tool definition (no dsh imports,
  fully testable); `src/host.ts` registers it with `defineTool`.
- `src/spotlight.ts`, `src/prefill.ts`, `src/stylesheet.ts` — client
  pure logic: hole geometry, prefill attempt, token-generated CSS.
- `src/client.tsx` — the `shell.overlay` entry and the panel component.
- `src/host.ts` — Cordis entry: tool registration plus the
  `tour/get-state`, `tour/step-action` and `tour/report-prefill`
  client RPC handlers.

## Regenerating

```sh
pnpm --filter @trythursday/thursday-tour run steps
```

## Wiring cloned from

thursday-mark: the only existing plugin with host + client halves
(package shape, build config, patch row, stub-DOM client tests).
meridian-breaker: the `link-dsh-packages.mjs` pattern for resolving
`@deepseek-ai/*` at test/typecheck time against the harness's own copy.
