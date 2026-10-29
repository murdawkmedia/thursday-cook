import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const generator = join(import.meta.dir, "gen-th-skills.ts");
const cleanups: (() => void)[] = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function output() {
  const dir = mkdtempSync(join(tmpdir(), "thursday-skills-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function generate(...args: string[]) {
  const result = Bun.spawnSync([process.execPath, "run", generator, ...args], {
    env: { ...process.env, HOME: tmpdir() },
  });
  expect(result.exitCode).toBe(0);
}

function skillText(out: string, name: string) {
  // Wrapped prose breaks phrases across lines; compare one line.
  return readFileSync(join(out, name, "SKILL.md"), "utf8").replace(/\s+/g, " ");
}

describe("gen-th-skills", () => {
  test("a verb skill resolves one path instead of reading two", () => {
    const out = output();
    generate("--out", out, "--repo", "/opt/thursday/checkout", "--bun", "/opt/bun");

    const skill = skillText(out, "th");

    expect(skill).toContain(
      "/opt/bun run /opt/thursday/checkout/scripts/th-proc.ts 000-th-how-to-talk.md",
    );
    expect(skill).toContain("Never read one from each place");

    expect(skill).not.toContain("personal dir comes first");
    expect(skill).not.toContain("<personal>/procedures");
    expect(skill).not.toContain("<install.repo>/procedures");
  });

  test("the committed default carries the placeholder, not a home directory", () => {
    const out = output();
    generate("--out", out);

    const skill = skillText(out, "th");
    expect(skill).toContain("bun run <install.repo>/scripts/th-proc.ts");
    expect(skill).not.toContain(process.env.HOME ?? "/home/");
  });

  test("a protocol verb points at the root skill", () => {
    const out = output();
    generate("--out", out, "--repo", "/opt/thursday/checkout");

    const skill = skillText(out, "thdoit");
    expect(skill).toContain("The root skill carries the rule for this one");
  });
});
