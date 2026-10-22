# bunstrap on Windows: make sure bun exists, then hand off to setup.
#
# Uses bun if it is already on PATH. If it is not, installs a pinned copy into
# the Thursday root and uses that. Nothing is installed system-wide.
#
#   powershell -ExecutionPolicy Bypass -File scripts\bunstrap.ps1 --personal $HOME\th --skills-dir $HOME\.commandcode\skills --yes
#
# Every argument is passed through to scripts\setup.ts.

$ErrorActionPreference = "Stop"
$BunVersion = "1.4.2"
$RepoDir = Split-Path -Parent $PSScriptRoot

function Get-ThursdayRoot {
    if ($env:THURSDAY_ROOT) { return $env:THURSDAY_ROOT }
    return Join-Path $env:LOCALAPPDATA "thursday"
}

$Root = Get-ThursdayRoot
$LocalBun = Join-Path $Root "bin\bun.exe"
$Bun = $null

$onPath = Get-Command bun -ErrorAction SilentlyContinue
if ($onPath) {
    $Bun = $onPath.Source
    Write-Host "using bun at $Bun"
}
elseif (Test-Path $LocalBun) {
    $Bun = $LocalBun
    Write-Host "using bun at $Bun"
}
else {
    Write-Host "bun not found. installing bun $BunVersion into $Root\bin"
    Write-Host "this fetches and runs the official installer from bun.sh"
    $env:BUN_INSTALL = $Root
    Invoke-Expression (Invoke-RestMethod "https://bun.sh/install.ps1")
    $Bun = $LocalBun
}

if (-not (Test-Path $Bun)) {
    Write-Error "bun is still missing after install; tried $Bun"
    exit 2
}

& $Bun run (Join-Path $RepoDir "scripts\setup.ts") @args
exit $LASTEXITCODE
