import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const setup = join(import.meta.dir, "setup.ts");

function preview(source: string, expected: (home: string) => string) {
  const home = mkdtempSync(join(tmpdir(), "thursday-setup-test-"));
  const root = join(home, "install");
  try {
    const result = Bun.spawnSync(
      [process.execPath, "run", setup, "--home", home, "--root", root,
        "--personal", join(home, "personal"), "--skills-dir", join(home, "skills"),
        "--from", source, "--yes", "--dry-run", "--json"],
      {
        cwd: home,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: home,
          USERPROFILE: home,
          LOCALAPPDATA: join(home, "appdata"),
          XDG_DATA_HOME: join(home, "data"),
        },
      },
    );
    expect(result.exitCode).toBe(0);
    const layout = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(layout.source).toBe(expected(home));
    expect(existsSync(root)).toBe(false);
    expect(existsSync(join(home, "skills"))).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

for (const source of [
  "https://example.com/team/thursday.git",
  "ssh://git@example.com/team/thursday.git",
  "git@example.com:team/thursday.git",
]) {
  test(`setup preserves remote source ${source}`, () => preview(source, () => source));
}

test("setup still resolves relative local sources", () => {
  preview("./local-checkout", home => resolve(home, "local-checkout"));
});

test("setup still expands home-relative local sources", () => {
  preview("~/local-checkout", home => join(home, "local-checkout"));
});
