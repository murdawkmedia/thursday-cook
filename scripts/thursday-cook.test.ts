import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

test("Cook installs as a self-contained named skill with portable references", () => {
  const source = resolve(import.meta.dir, "../.agents/skills/thursday-cook");
  expect(existsSync(join(source, "SKILL.md"))).toBe(true);
  const staging = mkdtempSync(join(tmpdir(), "cook-pack-"));
  try {
    const pack = join(staging, "thursday-cook");
    cpSync(source, pack, { recursive: true });
    const body = readFileSync(join(pack, "SKILL.md"), "utf8");
    expect(body).toMatch(/^---\nname: thursday-cook\n/);
    expect(body.split(/\s+/).length).toBeLessThanOrEqual(500);
    expect(body).not.toMatch(/\/(?:home|Users)\/|[A-Z]:\\Users\\/);
    const files: string[] = [];
    const visit = (folder: string) => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        expect(entry.isSymbolicLink()).toBe(false);
        if (entry.isDirectory()) visit(path);
        else {
          files.push(relative(pack, path).replaceAll("\\", "/"));
          for (const match of readFileSync(path, "utf8").matchAll(/\]\(([^)]+)\)/g)) {
            const target = match[1].split("#")[0];
            if (!target || /^[a-z]+:/i.test(target)) continue;
            const resolved = resolve(folder, target);
            expect(relative(pack, resolved).startsWith("..")).toBe(false);
            expect(existsSync(resolved)).toBe(true);
          }
        }
      }
    };
    visit(pack);
    expect(files.sort()).toEqual(["NOTICE.md", "SKILL.md", "references/measurements.md"]);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
});
