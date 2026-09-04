/**
 * @thursday/build — the shared esbuild pipeline for dsh plugin halves.
 *
 * Extracted from dotfiles-ai/build.mjs, which hard-coded ~25 entry points in
 * one array. Here a package declares its own build (`build.config.mjs`
 * exporting `defineBuild({...})`) and `discoverBuildSpecs` finds them all, so
 * adding a plugin does not mean editing a central list.
 */
export { cssTextPlugin } from "./css-text.js";
export { CLIENT_EXTERNAL, CREATE_REQUIRE_BANNER, HOST_EXTERNAL, defineBuild } from "./spec.js";
export type {
  BuildOutput,
  BuildSpec,
  ClientBuild,
  ClientWrapper,
  EsbuildOverrides,
  HostBuild,
} from "./spec.js";
export { buildHost, hostBuildOptions } from "./host.js";
export type { HostBuildContext } from "./host.js";
export {
  CLIENT_TSCONFIG_RAW,
  assertNoAutomaticJsxRuntime,
  buildClient,
  clientBuildOptions,
  wrapModuleLoaderFacade,
} from "./client.js";
export type { ClientBuildContext } from "./client.js";
export { buildAll, buildPackage } from "./run.js";
export { checkDrift } from "./drift.js";
export type { DriftCheckResult } from "./drift.js";
export { BUILD_CONFIG_FILENAMES, DEFAULT_PACKAGE_DIRS, discoverBuildSpecs } from "./discover.js";
export { main, runBuild } from "./cli.js";
export type { RunBuildOptions } from "./cli.js";
