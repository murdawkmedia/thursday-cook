/**
 * @trythursday/blocks — the composition, as a directory of files.
 *
 * This module exists so that a consumer can find the block files WITHOUT
 * knowing where the package landed on disk. `thursday install` runs from a
 * global npm prefix, from a pnpm store link, from inside a container image and
 * from this checkout, and each of those puts the markdown somewhere different.
 * Resolving from `import.meta.url` is the one answer correct in all four.
 *
 * What this deliberately does NOT do is enumerate the blocks. There is no
 * manifest here and there must not be one: the loader reads the directory, so
 * adding a block is adding a file. A list of names in this file would be a
 * second place to forget, and the whole point of a directory-as-composition is
 * that there is no such second place.
 */

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/**
 * Absolute path to the directory holding the block markdown files.
 *
 * Pass it to `loadBlockDir` from `@trythursday/install`. `README.md` is
 * documentation and the loader ignores it by default; anything that is not a
 * block lives in `notes/`, which the loader never descends into.
 */
export const blocksDir = dirname(fileURLToPath(import.meta.url));

export default { blocksDir };
