import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveThursdayHome as resolveInstallHome } from "../src/install";
import { resolveThursdayHome as resolveUninstallHome } from "../src/uninstall";

// uninstall is the only command that DELETES, so it is the worst place in the
// codebase for the home rule to be duplicated. It was: uninstall.ts carried its
// own resolver with no guards, so THURSDAY_HOME=~/.dsh resolved happily and the
// removal ran inside the user's real dsh home.
//
// These tests assert the DELEGATION, not the predicate. The guarded resolver
// already has its own tests; what was missing -- and what a mutation would
// otherwise restore silently -- is that uninstall actually calls it.

const ENV = process.env.THURSDAY_HOME;
const DSH = process.env.DSH_HOME;

beforeEach(() => {
  delete process.env.THURSDAY_HOME;
  delete process.env.DSH_HOME;
});

afterEach(() => {
  if (ENV === undefined) delete process.env.THURSDAY_HOME;
  else process.env.THURSDAY_HOME = ENV;
  if (DSH === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = DSH;
});

describe("uninstall's home resolution", () => {
  it("REFUSES a home that overlaps the user's dsh home", () => {
    process.env.THURSDAY_HOME = "~/.dsh";
    // Refusing to uninstall is always recoverable. Deleting the wrong
    // directory is not.
    expect(() => resolveUninstallHome()).toThrow(/overlap/i);
  });

  it("refuses a home that CONTAINS the dsh home", () => {
    process.env.DSH_HOME = "/tmp/holder/.dsh";
    process.env.THURSDAY_HOME = "/tmp/holder";
    expect(() => resolveUninstallHome()).toThrow(/overlap/i);
  });

  it("refuses a WSL drive mount", () => {
    process.env.THURSDAY_HOME = "/mnt/c/thursday";
    expect(() => resolveUninstallHome()).toThrow(/mnt/i);
  });

  it("agrees with the install resolver on every accepted value", () => {
    // The two must not drift apart again. If they ever disagree, install writes
    // to one directory and uninstall removes another.
    for (const value of ["~/thursday-test", "/opt/thursday", "relative/home"]) {
      process.env.THURSDAY_HOME = value;
      expect(resolveUninstallHome(), `disagreement on ${value}`).toBe(resolveInstallHome().path);
    }
  });

  it("refuses a bare ~, because $HOME CONTAINS ~/.dsh", () => {
    // Not an edge case worth excluding from the agreement test above: a
    // Thursday home at $HOME would make uninstall delete the user's entire
    // home directory, dsh install included.
    process.env.THURSDAY_HOME = "~";
    expect(() => resolveUninstallHome()).toThrow(/overlap/i);
  });

  it("expands ~/ against the user's home, not the filesystem root", () => {
    // The bug uninstall.ts already found once and documented, asserted here so
    // the delegation cannot reintroduce it from the other side.
    process.env.THURSDAY_HOME = "~/thursday-test";
    expect(resolveUninstallHome().startsWith("/thursday-test")).toBe(false);
    expect(resolveUninstallHome().endsWith("/thursday-test")).toBe(true);
  });
});
