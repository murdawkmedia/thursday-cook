import { describe, expect, it } from "vitest";

import { describeCommandFailure } from "../src/install";

// "Command failed with exit code 1" is what a real install printed for all
// fourteen of its pnpm failures. It names neither the reason nor anything the
// reader can act on, and the actual cause -- one line of pnpm's stderr -- had
// scrolled far above the summary where it could not be found.

describe("describeCommandFailure", () => {
  it("quotes the stderr that says why", () => {
    const err = Object.assign(new Error("Command failed with exit code 1"), {
      stderr: "ERR_PNPM_STORE\nunable to open database file",
    });
    const out = describeCommandFailure(err);
    expect(out).toContain("Command failed with exit code 1");
    expect(out).toContain("unable to open database file");
  });

  it("quotes the TAIL, because build tools print progress first and fail last", () => {
    const stderr = [...Array(40).keys()].map((i) => `progress ${i}`).concat("THE ACTUAL ERROR");
    const err = Object.assign(new Error("boom"), { stderr: stderr.join("\n") });
    const out = describeCommandFailure(err);
    expect(out).toContain("THE ACTUAL ERROR");
    expect(out).not.toContain("progress 0");
    // ...and says how much it dropped, so nobody thinks that was all of it.
    expect(out).toMatch(/33 earlier stderr line\(s\) omitted/);
  });

  it("drops blank lines so padding cannot push the cause out of the window", () => {
    const stderr = ["real cause here", ...Array(20).fill("")].join("\n");
    expect(describeCommandFailure(err(stderr))).toContain("real cause here");
  });

  it("falls back to the bare message when there is no stderr", () => {
    expect(describeCommandFailure(new Error("plain"))).toBe("plain");
    expect(describeCommandFailure(err(""))).toBe("boom");
    expect(describeCommandFailure(err("   \n  \n"))).toBe("boom");
  });

  it("survives a non-Error throw", () => {
    expect(describeCommandFailure("just a string")).toBe("just a string");
    expect(describeCommandFailure(null)).toBe("null");
  });
});

function err(stderr: string) {
  return Object.assign(new Error("boom"), { stderr });
}
