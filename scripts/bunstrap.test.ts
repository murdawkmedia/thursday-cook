import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function fixture() {
  const home = mkdtempSync(join(tmpdir(), "thursday-bunstrap-"));
  cleanups.push(home);
  writeFileSync(join(home, ".bashrc"), "profile sentinel\n");
  return {
    home,
    env: { ...process.env, HOME: home, USERPROFILE: home,
      LOCALAPPDATA: join(home, "appdata"), XDG_DATA_HOME: join(home, "data"),
      THURSDAY_DOWNLOAD_MARKER: join(home, "download-attempted") },
  };
}

const pwsh = spawnSync("pwsh", ["-NoLogo", "-NoProfile", "-Command", "exit 0"]);
test.skipIf(process.platform === "win32")("POSIX dry run without a runtime creates no install or profile writes", () => {
  const { home, env } = fixture();
  const bin = join(home, "bin");
  mkdirSync(bin);
  for (const name of ["dirname", "uname"]) symlinkSync(`/usr/bin/${name}`, join(bin, name));
  writeFileSync(join(bin, "curl"), '#!/bin/sh\nprintf attempted > "$THURSDAY_DOWNLOAD_MARKER"\nexit 99\n', { mode: 0o755 });
  const result = spawnSync("/bin/sh", [join(import.meta.dirname, "bunstrap.sh"), "--dry-run"], {
    env: { ...env, PATH: bin }, encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toContain("would install bun");
  expect(existsSync(env.THURSDAY_DOWNLOAD_MARKER)).toBe(false);
  expect(existsSync(env.XDG_DATA_HOME)).toBe(false);
  expect(readFileSync(join(home, ".bashrc"), "utf8")).toBe("profile sentinel\n");
});

test.skipIf(pwsh.status !== 0)("PowerShell dry run without a runtime never invokes the downloader", () => {
  const { home, env } = fixture();
  const command = `
    function Get-Command { param([string]$Name) return $null }
    function Invoke-RestMethod {
      [IO.File]::WriteAllText($env:THURSDAY_DOWNLOAD_MARKER, 'attempted')
      throw 'NETWORK_BLOCKED_BY_TEST'
    }
    & $env:THURSDAY_BOOTSTRAP --dry-run
  `;
  const result = spawnSync("pwsh", ["-NoLogo", "-NoProfile", "-Command", command], {
    env: { ...env, THURSDAY_BOOTSTRAP: join(import.meta.dirname, "bunstrap.ps1") }, encoding: "utf8",
  });
  expect(existsSync(env.THURSDAY_DOWNLOAD_MARKER)).toBe(false);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("would install bun");
  expect(existsSync(env.LOCALAPPDATA)).toBe(false);
  expect(readFileSync(join(home, ".bashrc"), "utf8")).toBe("profile sentinel\n");
});
