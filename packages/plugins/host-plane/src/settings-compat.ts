/**
 * 0.1.5 settings-API compatibility for migrated dotfiles-ai plugins.
 *
 * In 0.1.0-rc.8, `@deepseek-ai/dsh-settings` exported two helpers:
 * `settingsNamespace(ns)` (validated identity) and
 * `installSettingsSection(owner, ns, schema, entry, hooks)` (registered the
 * namespace through the settings service when mounted, else fell back to the
 * composition entry).
 *
 * In 0.1.5-rc.3 the package exports only `SettingsProvider` (+errors): the
 * helpers are gone, and the provider carries `installSection` as a METHOD
 * with the same trailing call shape (owner first). `settingsNamespace` was
 * an identity validation — a plain string is the 0.1.5 namespace.
 *
 * These shims restore the old call shape on top of the new provider:
 * `installSettingsSection` injects `settings` and delegates to
 * `settings.installSection(...)`. Where no settings service mounts, the
 * hooks keep the composition entry — the same fallback contract.
 */
export function settingsNamespace(ns: string): string {
  return ns;
}

interface SettingsHooks {
  setSource: (current: () => unknown) => void;
  onChange: () => void;
  validate?: (value: unknown) => unknown;
}

interface SettingsServiceLike {
  installSection(
    owner: unknown,
    ns: string,
    schema: unknown,
    entry: unknown,
    hooks: SettingsHooks,
  ): void;
}

export function installSettingsSection(
  ctx: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inject(deps: any, cb: (scope: { settings: SettingsServiceLike }) => void): unknown;
  },
  ns: string,
  schema: unknown,
  entry: unknown,
  hooks: SettingsHooks,
): void {
  ctx.inject(["settings"], (scope) => {
    scope.settings.installSection(ctx, ns, schema, entry, hooks);
  });
}
