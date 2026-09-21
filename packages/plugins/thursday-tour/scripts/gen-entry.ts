/**
 * Codegen entry for `pnpm run steps`: read `data/steps.yaml`, validate it,
 * and write the checked-in `src/steps.generated.ts`.
 *
 * Runs BUNDLED, not imported: `scripts/generate-steps.mjs` esbuilds this
 * file (plus `src/steps` and `src/yaml`) into one plain-JS bundle and runs
 * that, so generation needs nothing but the workspace esbuild and works the
 * same way on every machine. Keep this file free of `@deepseek-ai/*` and
 * DOM imports -- it runs on bare node.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseTourFile, validateSteps } from "../src/steps";

// The bundle runs from a temp file, so `import.meta.url` no longer names
// this package: the wrapper passes the package root as argv[2].
const packageRoot = process.argv[2] as string;

function renderModule(tickets: readonly string[], steps: readonly unknown[]): string {
  return (
    "/**\n" +
    " * GENERATED FILE -- DO NOT EDIT.\n" +
    " *\n" +
    " * Source of truth: data/steps.yaml.\n" +
    " * Regenerate with: pnpm --filter @trythursday/thursday-tour run steps.\n" +
    " * The sync test (tests/steps.test.ts) fails if this drifts from the YAML.\n" +
    " */\n" +
    'import type { TourStep } from "./steps";\n' +
    "\n" +
    `export const PLAN_TICKETS: readonly string[] = ${JSON.stringify(tickets)};\n` +
    "\n" +
    `export const STEPS: readonly TourStep[] = ${JSON.stringify(steps, null, 2)};\n`
  );
}

const yaml = readFileSync(join(packageRoot, "data", "steps.yaml"), "utf8");
const tour = parseTourFile(yaml);
const errors = validateSteps(tour.steps, tour.tickets);
if (errors.length > 0) {
  for (const error of errors) console.error(`thursday-tour/steps: ${error}`);
  process.exit(1);
}
writeFileSync(
  join(packageRoot, "src", "steps.generated.ts"),
  renderModule(tour.tickets, tour.steps),
);
console.log(`thursday-tour: ${tour.steps.length} steps, ${tour.tickets.length} plan tickets`);
