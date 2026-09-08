import { describe, expect, it } from "vitest";

import { checkThursdayHomeSafety, resolveThursdayHome } from "../src/index";

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
