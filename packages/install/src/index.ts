/**
 * The Thursday install engine's block layer: schema, action registry, loader.
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
  validateStepList,
  type ActionDefinition,
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
  constraintsNamed,
  hasConstraint,
  loadBlockFile,
  parseBlock,
  type Block,
  type SurfacedConstraint,
} from "./loader";
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
