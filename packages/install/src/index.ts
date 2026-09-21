/**
 * The Thursday install engine's block layer: schema, action registry, loader,
 * and the composition generator that turns a loaded block set into the
 * profile's `cordis.patch.yml`.
 *
 * A block is one markdown file — YAML frontmatter for the data, prose for the
 * reasons, named actions for the steps. See docs/block-format.md for the
 * decision and packages/install/examples for blocks written against it.
 */
export {
  DETECT_ACTIONS,
  DETECT_ACTION_NAMES,
  INSTALL_ACTIONS,
  INSTALL_ACTION_NAMES,
  copyTreeSourceBaseSchema,
  validateStepList,
  type ActionDefinition,
  type CopyTreeSourceBase,
  type DetectActionName,
  type DetectStep,
  type InstallActionName,
  type Step,
} from "./actions";
export {
  CONSTRAINTS,
  CONSTRAINT_NAMES,
  constraintNameSchema,
  findConstraint,
  type ConstraintDefinition,
  type ConstraintName,
} from "./constraints";
export { BlockError, type BlockProblem } from "./errors";
export {
  DIST_ROOT_MARKERS,
  DIST_SOURCE_BASE_NAME,
  distributionRoot,
  findDistributionRoot,
} from "./dist-root";
export {
  constraintsNamed,
  hasConstraint,
  loadBlockDir,
  loadBlockFile,
  parseBlock,
  type Block,
  type SurfacedConstraint,
} from "./loader";
export {
  PatchError,
  generateWebPatch,
  orderBlocks,
  planWebPatch,
  type OverrideDifference,
  type PatchProblem,
  type PatchRow,
  type WebPatch,
  type WebPatchOptions,
} from "./patch";
export {
  blockFrontmatterSchema,
  type BlockFrontmatter,
  type ConfigChange,
  type DeclaredConstraint,
  type DshConfigChange,
  type EnvironmentChange,
  type InstalledPath,
  type Integration,
  type ProvidedCommand,
  type RawFrontmatter,
  type SideEffect,
} from "./schema";
export {
  UPSTREAM_ROWS,
  UPSTREAM_ROW_IDS,
  readBundleDefaults,
  type UpstreamRow,
  type UpstreamRowId,
  type UpstreamRowTable,
} from "./upstream";

// The EXECUTION layer. The header above describes this module as the block
// layer, and that scoping is why `install`, `uninstall` and `detectBlockStatus`
// were never exported: the whole half of the engine that actually does the work
// was unreachable from outside the package, and nothing noticed because every
// caller was a test living inside it. `thursday install` is the first real
// consumer, and it could not import the function it exists to call.
export {
  baseDirFor,
  checkDepsSatisfied,
  classifyReplacement,
  createFilesystemAPI,
  detectBlockStatus,
  executeInstall,
  executeStep,
  install,
  planCopyTree,
  planInstall,
  previewPatchFileExact,
  resolveThursdayHome,
  runDetectStep,
  type BlockDetection,
  type CopyTreePlan,
  type DetectionStatus,
  type ExecutionPlan,
  type FilesystemAPI,
  type InstallOptions,
  type InstallProblem,
  type InstallResult,
  type PatchFileExactPreview,
  type PlannedStep,
  type ReplacementState,
  type ResolvedThursdayHome,
  type StepResult,
  type WizardContext,
  type WizardReport,
} from "./install";
// `resolveThursdayHome` is deliberately NOT re-exported from ./uninstall: it
// used to be a second implementation of the same rule and is now a delegating
// wrapper, so exporting both names would offer callers a choice that no longer
// exists and invite the duplication back.
export {
  KNOWN_THURSDAY_DIRS,
  OUTSIDE_THE_HOME_EFFECTS,
  defaultAiScratchDir,
  expandPath,
  findUnexpectedFiles,
  getIconRemovalPaths,
  uninstall,
  uninstallWithOutput,
  type ConfirmPrompt,
  type OutsideTheHomeEffect,
  type UnexpectedFilePolicy,
  type UninstallResult,
} from "./uninstall";
export {
  describeMeridianVerdict,
  isUsable,
  verifyMeridianHealth,
  type MeridianVerdict,
} from "./meridian";
export {
  DSH_IMPORT_FORBIDDEN,
  assertInsideHome,
  copyDshImport,
  previewDshImport,
  resolveUserDshHome,
  type AdoptedChains,
  type DshCopyOptions,
  type DshCopyResult,
  type DshFs,
  type DshImportPreview,
  type ImportedProvider,
} from "./dsh-import";
export {
  patchAgentDefaultModel,
  patchRegion,
  renderChainsRegion,
  renderProviderLines,
  renderProvidersRegion,
  type SettingsProvider,
} from "./settings-patch";
export {
  AIDOS_SCRATCH_WIRE_POINT,
  FREE_FLASH,
  FREE_FRONTIER,
  FREE_PROVIDER_NAME,
  MERIDIAN_DEFAULT_PORT,
  hasAidosModelConfig,
  provisionalAidosScratchDir,
  runWizard,
  type ClaudeBranch,
  type DiscoveredModel,
  type MeridianSetupResult,
  type WizardEnvironment,
  type WizardProbes,
  type WizardPrompts,
  type WizardReceipt,
  type WizardRunOptions,
  type WizardRunResult,
} from "./wizard";
