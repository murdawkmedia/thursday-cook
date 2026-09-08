import { describe, expect, it } from "vitest";

import {
  KNOWN_COMMANDS,
  checkThursdayHomeSafety,
  preflight,
  resolveThursdayHome,
} from "../src/index";

// These two functions decide WHERE EVERY FILE GOES. They are unit-tested rather
// than exercised only through an end-to-end install because the failures that
// matter are the ones an end-to-end run on a healthy machine never reaches: a
// tilde that expands to the filesystem root, a home that overlaps the user's
// real dsh install. E6 promises "nothing outside the Thursday home"; these are
// the assertions that promise rests on.

const HOME = "/home/tester";

describe("resolveThursdayHome", () => {
  it("defaults to ~/.thursday when THURSDAY_HOME is unset", () => {
    expect(resolveThursdayHome({}, HOME)).toBe("/home/tester/.thursday");
  });

  it("treats an empty or whitespace THURSDAY_HOME as unset", () => {
    // An exported-but-empty variable is the normal shape of "the wizard did not
    // set it". Reading it as a path would resolve to the process cwd.
    expect(resolveThursdayHome({ THURSDAY_HOME: "" }, HOME)).toBe("/home/tester/.thursday");
    expect(resolveThursdayHome({ THURSDAY_HOME: "   " }, HOME)).toBe("/home/tester/.thursday");
  });

  it("expands ~/ against the user's home rather than the filesystem root", () => {
    // THE REGRESSION THIS FILE EXISTS FOR. The previous implementation was
    // `resolve(homedir(), value.slice(1))`, and slice(1) of "~/thursday-test"
    // is "/thursday-test" -- an ABSOLUTE path, which resolve() honours by
    // discarding the base. The install then created a directory at "/".
    expect(resolveThursdayHome({ THURSDAY_HOME: "~/thursday-test" }, HOME)).toBe(
      "/home/tester/thursday-test",
    );
    expect(resolveThursdayHome({ THURSDAY_HOME: "~/nested/deeper" }, HOME)).toBe(
      "/home/tester/nested/deeper",
    );
  });

  it("resolves a bare ~ to the user's home", () => {
    expect(resolveThursdayHome({ THURSDAY_HOME: "~" }, HOME)).toBe(HOME);
  });

  it("does not expand a tilde that is not a home reference", () => {
    // "~foo" is another user's home in shell syntax, which we do not implement,
    // and "./~" is a literal directory named "~". Neither may silently become
    // the current user's home.
    expect(resolveThursdayHome({ THURSDAY_HOME: "/tmp/~weird" }, HOME)).toBe("/tmp/~weird");
  });

  it("resolves a relative THURSDAY_HOME to an absolute path", () => {
    const got = resolveThursdayHome({ THURSDAY_HOME: "relative/home" }, HOME);
    expect(got.startsWith("/")).toBe(true);
    expect(got.endsWith("/relative/home")).toBe(true);
  });
});

describe("checkThursdayHomeSafety", () => {
  const env = (dshHome?: string) => (dshHome ? { DSH_HOME: dshHome } : {});

  it("accepts a home that is nowhere near the user's dsh home", () => {
    expect(checkThursdayHomeSafety("/home/tester/.thursday", env(), HOME)).toBeNull();
  });

  it("refuses a Thursday home that IS the dsh home", () => {
    const problem = checkThursdayHomeSafety("/home/tester/.dsh", env(), HOME);
    expect(problem).toContain("overlaps");
  });

  it("refuses a Thursday home INSIDE the dsh home", () => {
    // The direction that would write Thursday's files into the user's install.
    expect(checkThursdayHomeSafety("/home/tester/.dsh/thursday", env(), HOME)).toContain(
      "overlaps",
    );
  });

  it("refuses a Thursday home CONTAINING the dsh home", () => {
    // The direction that matters at UNINSTALL: removing the Thursday home
    // would take the user's dsh home with it.
    expect(checkThursdayHomeSafety("/home/tester", env(), HOME)).toContain("overlaps");
  });

  it("honours DSH_HOME when the user has moved it", () => {
    expect(checkThursdayHomeSafety("/opt/dsh/inner", env("/opt/dsh"), HOME)).toContain("overlaps");
    // ...and stops guarding the default location once it has been moved away.
    expect(checkThursdayHomeSafety("/home/tester/.dsh", env("/opt/dsh"), HOME)).toBeNull();
  });

  it("resolves a relative DSH_HOME before comparing", () => {
    // A relative DSH_HOME compared verbatim never matches anything, so the
    // guard would pass while the two homes genuinely overlapped.
    const problem = checkThursdayHomeSafety(process.cwd(), { DSH_HOME: "." }, HOME);
    expect(problem).toContain("overlaps");
  });

  it("is not fooled by a shared name prefix", () => {
    // "/home/tester/.dsh-backup" starts with "/home/tester/.dsh" as a STRING
    // but is not inside it. A prefix test without the separator would refuse a
    // legitimate home.
    expect(checkThursdayHomeSafety("/home/tester/.dsh-backup", env(), HOME)).toBeNull();
  });

  it("refuses a WSL drive mount", () => {
    expect(checkThursdayHomeSafety("/mnt/c/Users/tester/thursday", env(), HOME)).toContain("/mnt/");
  });
});

describe("preflight", () => {
  // These exist because a mutation run proved the guards above were NOT
  // protected. Re-wrapping the safety call in `COMMANDS_NEEDING_HOME.has(...)`
  // -- reintroducing the exact bug where the command that CREATES the home was
  // the only one that never checked where -- left the whole suite green. The
  // guard was tested; its call site was not. Every test in this block asserts
  // the DISPATCH, not the predicate.

  const allExist = () => true;
  const noneExist = () => false;

  it("refuses install into a home that overlaps the user's dsh home", () => {
    // THE SURVIVOR. install is exempt from the existence checks, and was
    // wrongly exempt from the safety checks with it.
    const got = preflight("install", { THURSDAY_HOME: "~/.dsh" }, HOME, noneExist);
    expect(got.ok).toBe(false);
    expect(got.ok === false && got.message).toContain("overlaps");
  });

  it("refuses install onto a WSL drive mount", () => {
    const got = preflight("install", { THURSDAY_HOME: "/mnt/c/thursday" }, HOME, noneExist);
    expect(got.ok).toBe(false);
    expect(got.ok === false && got.message).toContain("/mnt/");
  });

  it("applies the safety guards to EVERY known command, not a chosen few", () => {
    // Enumerated from the exported set rather than hand-listed, so a command
    // added later is covered without anyone remembering to add a case here.
    for (const command of KNOWN_COMMANDS) {
      const got = preflight(command, { THURSDAY_HOME: "~/.dsh" }, HOME, allExist);
      expect(got.ok, `${command} must refuse a home overlapping ~/.dsh`).toBe(false);
      expect(got.ok === false && got.message).toContain("overlaps");
    }
  });

  it("still lets install proceed without an existing home", () => {
    // The other half of the split: install must NOT be blocked by "home does
    // not exist yet", which is the circular error this ordering was built to
    // avoid. A guard fix that broke this would be a regression too.
    const got = preflight("install", { THURSDAY_HOME: "~/thursday-test" }, HOME, noneExist);
    expect(got.ok).toBe(true);
    expect(got.ok === true && got.home).toBe("/home/tester/thursday-test");
  });

  it("blocks commands that need a home when the home is missing", () => {
    const got = preflight("serve", { THURSDAY_HOME: "~/thursday-test" }, HOME, noneExist);
    expect(got.ok).toBe(false);
    expect(got.ok === false && got.message).toContain("run 'thursday install' first");
  });

  it("blocks commands that need a runtime when only the home exists", () => {
    const exists = (path: string) => !path.includes("node_modules");
    const got = preflight("serve", { THURSDAY_HOME: "~/thursday-test" }, HOME, exists);
    expect(got.ok).toBe(false);
    expect(got.ok === false && got.message).toContain("runtime not found");
  });

  it("rejects an unknown command before touching the filesystem", () => {
    const got = preflight("instal", { THURSDAY_HOME: "~/.dsh" }, HOME, noneExist);
    expect(got.ok).toBe(false);
    // A typo must be reported AS a typo, not as whatever the home happens to
    // be wrong about -- otherwise `thursday instal` complains about ~/.dsh.
    expect(got.ok === false && got.message).toContain("unknown command");
  });
});
