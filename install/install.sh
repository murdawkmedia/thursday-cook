#!/bin/sh
# Thursday's public bootstrapper:
#   curl -fsSL https://trythursday.org/install.sh | sh
#
# POSIX sh from line 1, deliberately. Piping into `sh` can land in dash, and
# macOS still ships bash 3.2, so a bash-5 script here would have to be
# rewritten rather than extended. No arrays, no `local`, no `${v,,}`, no `<()`.
#
# It does four things: detect the platform, check prerequisites, fetch the
# repository, and exec the TypeScript install engine. Every installation
# decision belongs to that engine (I4), not to this file. It knows nothing
# about blocks, plugins, presets or the composition.
set -eu
umask 077

NODE_MIN=24                       # keep in step with package.json engines.node
REF=${THURSDAY_REF:-main}
# TODO(I11/W3): the repository is not published yet, so this URL is a marked
# placeholder and is NOT expected to resolve. Until it does, point
# THURSDAY_SOURCE at an existing checkout (or THURSDAY_REPO at a fork).
REPO_URL=${THURSDAY_REPO:-https://github.com/trythursday/thursday.git}

say() { printf 'thursday: %s\n' "$*" >&2; }
die() { printf 'thursday: %s\n' "$*" >&2; exit 1; }
need() {
	command -v "$1" >/dev/null 2>&1 ||
		die "$1 is required but was not found on PATH. Install it: $2"
}

# --- platform (v0.1.0 is Linux only; refuse, do not half-work) --------------
os=$(uname -s 2>/dev/null || echo unknown)
case $os in
Linux) ;;
Darwin) die "macOS is not supported in v0.1.0 (Linux only). Use the Docker image: https://trythursday.org/docker" ;;
CYGWIN* | MINGW* | MSYS* | Windows_NT) die "Windows is not supported in v0.1.0 (Linux only). Use WSL2 with a Linux-side home, or the Docker image." ;;
*) die "unsupported platform '$os'. Thursday v0.1.0 is Linux only." ;;
esac
if [ -z "${HOME:-}" ]; then
	die "HOME is unset, so the Thursday home cannot be resolved. Set HOME, or set THURSDAY_HOME to an absolute path."
fi

# --- THURSDAY_HOME, by the two rules in docs/dsh-home.md Q1 -----------------
# Resolved here only to fail fast on the two refusals; the engine re-resolves
# it and owns the authoritative check.
# ':-' is exactly Q1's "if set and non-empty": empty behaves as unset.
home=${THURSDAY_HOME:-$HOME/.thursday}
tilde='~'
case $home in
"$tilde") home=$HOME ;;
"$tilde"/*) home=$HOME/${home#"$tilde"/} ;;
esac
case $home in /*) ;; *) home=$PWD/$home ;; esac
case $home in /mnt/*) die "THURSDAY_HOME resolves to '$home', under /mnt. A DrvFs path cannot hold Unix permissions on the credential file. Set THURSDAY_HOME to a path in the Linux filesystem, e.g. \$HOME/.thursday." ;; esac
# The trailing slashes make one glob cover both 'equal to' and 'inside'.
dsh_home=${DSH_HOME:-$HOME/.dsh}
case "$home/" in "$dsh_home"/*) die "THURSDAY_HOME ('$home') is inside your own dsh home ('$dsh_home'). Thursday never reads or writes there. Choose a THURSDAY_HOME outside it." ;; esac
case "$dsh_home/" in "$home"/*) die "THURSDAY_HOME ('$home') contains your own dsh home ('$dsh_home'). Thursday never reads or writes there. Choose a THURSDAY_HOME that does not enclose it." ;; esac
export THURSDAY_HOME="$home"

# --- prerequisites: node, then pnpm via corepack ----------------------------
need node "https://nodejs.org, or a version manager such as fnm or nvm (node >= $NODE_MIN)"
node_v=$(node -v)
node_major=${node_v#v}
node_major=${node_major%%.*}
case $node_major in '' | *[!0-9]*) die "could not read a version number from 'node -v' (it printed '$node_v')." ;; esac
if [ "$node_major" -lt "$NODE_MIN" ]; then
	die "node $node_v is too old. Thursday needs node >= $NODE_MIN (package.json engines.node). Install a newer node from https://nodejs.org, or run 'fnm install $NODE_MIN'."
fi
if ! command -v pnpm >/dev/null 2>&1; then
	need corepack "it ships with node; on a distro that strips it, 'npm install -g corepack'"
	say "pnpm not found; enabling it through corepack"
	corepack enable pnpm >/dev/null 2>&1 ||
		die "'corepack enable pnpm' failed. It writes shims beside the node binary and needs write access there. Install pnpm yourself instead: 'npm install -g pnpm'."
fi

# --- fetch ------------------------------------------------------------------
# A shallow git clone, not a tarball: git is a prerequisite either way, the
# clone carries the ref that `thursday status` reports drift against, and it
# needs no tar/gzip/checksum handling here. THURSDAY_SOURCE skips it entirely.
src=${THURSDAY_SOURCE:-}
if [ -n "$src" ]; then
	if [ ! -f "$src/package.json" ]; then
		die "THURSDAY_SOURCE is '$src' but there is no package.json there. Point it at a Thursday checkout."
	fi
	say "using the checkout at $src"
else
	need git "your package manager, e.g. 'sudo dnf install git' or 'sudo apt install git'"
	src=$home/cache/tmp/checkout
	mkdir -p "$home/cache/tmp"
	rm -rf "$src"
	say "fetching Thursday ($REF) into $src"
	git clone --depth 1 --branch "$REF" "$REPO_URL" "$src" ||
		die "could not clone $REPO_URL at ref '$REF'. If the repository is not published yet, set THURSDAY_SOURCE to a local checkout."
fi

# Activate the pnpm the checkout pins, so the engine installs with that one
# rather than with whatever pnpm happened to be on PATH already.
pm=$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$src/package.json" | head -n 1)
if [ -n "$pm" ] && command -v corepack >/dev/null 2>&1; then
	corepack prepare "$pm" --activate >/dev/null 2>&1 ||
		say "could not activate $pm through corepack; continuing with the pnpm already on PATH"
fi

# --- hand off ---------------------------------------------------------------
# SEAM (I4 / C6): packages/cli is a README placeholder today, so this entry
# point is inferred, not observed. I4 owns the engine binary and C6 owns the
# launcher; whichever lands first fixes this path, or overrides THURSDAY_ENTRY.
entry=${THURSDAY_ENTRY:-$src/packages/cli/bin/thursday.js}
# SEAM (R2): delete this if R2 decides to ship a prebuilt engine bundle.
if [ ! -d "$src/node_modules" ]; then
	say "installing the engine's own dependencies"
	(cd "$src" && pnpm install --frozen-lockfile) ||
		die "'pnpm install' failed in $src. Fix the error above and re-run."
fi
if [ ! -f "$entry" ]; then
	die "the install engine is not present at '$entry'. packages/cli is still a placeholder; that entry point is owned by I4/C6. Set THURSDAY_ENTRY once it exists."
fi
say "handing off to the install engine"
exec node "$entry" install "$@"
