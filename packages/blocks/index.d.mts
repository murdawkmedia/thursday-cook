/**
 * Types for the composition resolver.
 *
 * A sibling `.d.mts` is resolved automatically for `./index.mjs`, so this needs
 * no `types` field in package.json — which matters because the manifest is not
 * an agent-editable file and adding one would have meant another round trip.
 *
 * The module stays plain JavaScript on purpose: it is one `import.meta.url`
 * lookup with no build step, so it works identically from a checkout, a pnpm
 * link, a global npm prefix and inside the container image. A TypeScript source
 * would need compiling before the CLI could resolve it, which is a build
 * dependency for a single line.
 */

/**
 * Absolute path to the directory holding the block markdown files.
 *
 * Pass it to `loadBlockDir` from `@trythursday/install`. `README.md` is ignored
 * by the loader's default; anything that is not a block lives in `notes/`,
 * which the loader never descends into.
 */
export declare const blocksDir: string;

declare const _default: { blocksDir: string };
export default _default;
