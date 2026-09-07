/**
 * aidos-tools loader shim
 *
 * Thursday's aidos-tools preset row loads this shim. The shim re-exports the
 * aidos-tools plugin from the pinned aidos package that E5 installs into
 * $DSH_HOME/profiles/web/node_modules/aidos.
 *
 * Preset rows resolve bare specifiers against the harness, not the profile,
 * so this file provides the dynamic path needed to reach the installed module
 * at runtime. The file stays small and does not duplicate aidos code; it only
 * re-exports what the installed package provides.
 *
 * The real module lives in $DSH_HOME/profiles/web/node_modules/aidos, pinned
 * by dsh/profiles/web/package.json. The pin is the single source of identity;
 * Thursday never carries its own copy of aidos, and drift is impossible.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
const aidosModulePath = join(dshHome, 'profiles', 'web', 'node_modules', 'aidos');

// Re-export everything from the installed aidos-tools module
const require = createRequire(import.meta.url);
const aidosTools = require(join(aidosModulePath, 'lib', 'tools', 'aidos-tools.js'));

export const name = aidosTools.name;
export { apply } from aidosTools;
