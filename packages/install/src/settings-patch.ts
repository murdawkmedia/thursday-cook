/**
 * Line-wise surgery for the Thursday settings template (`config/settings.yaml`
 * copied to `$DSH_HOME/settings.yaml`).
 *
 * The template's own header states the two rules this module exists to obey:
 * never round-trip the file through a YAML parser (the bare `off:` key in a
 * reasoningEfforts map does not survive YAML 1.1 semantics), and preserve
 * `profile.active` across rewrites. Every function here therefore operates on
 * lines and touches only the region it names; everything else is byte-identical
 * afterwards.
 */

/** One provider as dsh records it: secret-free, keyed by env var name. */
export interface SettingsProvider {
  name: string;
  displayName: string;
  apiKeyEnv?: string;
  api: string;
  baseURL: string;
}

/**
 * Replace the lines between a `:begin` and `:end` marker pair with new lines.
 *
 * Callers pass the short anchor text (e.g. `"thursday-chains:begin"`). A
 * marker line is a comment carrying EXACTLY that anchor and nothing else
 * (`# thursday-chains:begin` after trimming). Substring matching is not enough:
 * the template's own header documents the markers in prose
 * (`#   # thursday-chains:begin / :end   the named route chains`), and an
 * `includes` match once anchored a region at that doc line and replaced
 * everything from the header down to the real `:end` — eating
 * `agent-default-model` and the providers region wholesale.
 *
 * The marker lines themselves are kept; only the body between them is
 * replaced. Throws when the pair is absent or reversed, because silently
 * appending a second region is how a file ends up with two provider maps and
 * whichever one the parser keeps last wins.
 */
export function patchRegion(
  content: string,
  beginMarker: string,
  endMarker: string,
  newLines: string[],
): string {
  const lines = content.split("\n");
  const isMarker = (line: string, marker: string) => line.trim() === `# ${marker}`;
  const begin = lines.findIndex((line) => isMarker(line, beginMarker));
  const end = lines.findIndex((line) => isMarker(line, endMarker));
  if (begin === -1 || end === -1) {
    throw new Error(
      `settings region markers not found: "${beginMarker}" / "${endMarker}". ` +
        `The settings template must carry both; refusing to append a duplicate region.`,
    );
  }
  if (end <= begin) {
    throw new Error(
      `settings region markers reversed: "${endMarker}" comes before "${beginMarker}".`,
    );
  }
  return [...lines.slice(0, begin + 1), ...newLines, ...lines.slice(end)].join("\n");
}

/** Render one provider map entry in the template's 4-space style. */
export function renderProviderLines(provider: SettingsProvider): string[] {
  const lines = [`    ${provider.name}:`, `      displayName: ${provider.displayName}`];
  if (provider.apiKeyEnv !== undefined) {
    lines.push(`      apiKeyEnv: ${provider.apiKeyEnv}`);
  } else {
    // A local proxy such as meridian needs no key. The line is a comment
    // rather than an empty value so no reader goes looking for the variable.
    lines.push(`      # local proxy: no key required`);
  }
  lines.push(`      api: ${provider.api}`, `      baseURL: ${provider.baseURL}`);
  return lines;
}

/** Render the whole providers region body from a provider list. */
export function renderProvidersRegion(providers: SettingsProvider[]): string[] {
  if (providers.length === 0) return [];
  return providers.flatMap((provider) => renderProviderLines(provider));
}

/**
 * Render the chains region body: the frontier chain feeds the orchestrator,
 * the flash chain feeds subagents, and the `see` helpers follow flash.
 *
 * The shape mirrors the template exactly (personal/work orchestrator plus the
 * subagent and see chains with their `chain:` splices); only the route heads
 * change, so a diff of this region reads as the model choice it is.
 */
export function renderChainsRegion(frontierChain: string[], flashChain: string[]): string[] {
  const render = (routes: string[]): string[] => routes.map((route) => `    - ${route}`);
  const flashHead = flashChain[0] ?? "deepseek-official/deepseek-v4-flash";
  return [
    `    personal-orchestrator:`,
    ...render(frontierChain),
    `    work-orchestrator:`,
    `    - chain:personal-orchestrator`,
    `    subagent:`,
    ...render(flashChain),
    `    subagent-work:`,
    `    - chain:subagent`,
    `    see:`,
    ...render([flashHead]),
    `    see-work:`,
    `    - chain:see`,
  ];
}

/**
 * Point `agent-default-model` at the frontier head, line-wise.
 *
 * Only the two 2-space `provider:` / `model:` lines inside the
 * `agent-default-model` block are touched; provider entries deeper in the file
 * sit at 6 spaces and cannot match. `profile.active` is elsewhere in the file
 * and is never visited.
 */
export function patchAgentDefaultModel(content: string, provider: string, model: string): string {
  const lines = content.split("\n");
  // Line-start anchored, not includes(): a prose mention of the key in the
  // template header must never anchor the block (same class as patchRegion).
  const start = lines.findIndex((line) => line.startsWith("agent-default-model:"));
  if (start === -1) {
    throw new Error(`agent-default-model block not found: the settings template must carry it.`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  let sawProvider = false;
  let sawModel = false;
  for (let i = start + 1; i < end; i++) {
    if (/^  provider: /.test(lines[i])) {
      lines[i] = `  provider: ${provider}`;
      sawProvider = true;
    } else if (/^  model: /.test(lines[i])) {
      lines[i] = `  model: ${model}`;
      sawModel = true;
    }
  }
  if (!sawProvider || !sawModel) {
    throw new Error(`agent-default-model block has no 2-space provider:/model: lines to update.`);
  }
  return lines.join("\n");
}
