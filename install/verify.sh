#!/bin/bash
# Behavioural harness for install/install.sh. Runs the script under REAL dash.
SCRIPT=/tmp/dsh/work/bootstrapper2/install/install.sh
DASH=/tmp/dsh/tools/bin/dash
SANDHOME=/tmp/dsh/work/bootstrapper2-out/fakehome
STUB=/tmp/dsh/work/bootstrapper2-out/stubbin
rm -rf "$SANDHOME" "$STUB"; mkdir -p "$SANDHOME" "$STUB"

# A fake checkout so no clone is attempted.
SRC=/tmp/dsh/work/bootstrapper2-out/fakesrc
rm -rf "$SRC"; mkdir -p "$SRC/node_modules"
cp /tmp/dsh/work/bootstrapper2/package.json "$SRC/package.json"

mkstub() { printf '#!/bin/sh\n%s\n' "$2" > "$STUB/$1"; chmod +x "$STUB/$1"; }
mkstub uname 'case "$1" in -s) echo "${FAKE_OS:-Linux}" ;; *) echo Linux ;; esac'
mkstub node 'case "$1" in -v) echo "${FAKE_NODE:-v24.9.0}" ;; *) echo "NODE_RAN argv=$*"; echo "NODE_PID=$$"; echo "THURSDAY_HOME=$THURSDAY_HOME" ;; esac'
mkstub pnpm 'echo "PNPM_RAN $*"'
mkstub corepack 'echo "COREPACK_RAN $*" >&2'
mkstub git 'echo "GIT_RAN $*" >&2; exit 1'
mkstub sed  "exec /usr/bin/sed \"\$@\""
mkstub head "exec /usr/bin/head \"\$@\""
mkstub rm   "exec /usr/bin/rm \"\$@\""
mkstub mkdir "exec /usr/bin/mkdir \"\$@\""
mkstub printf "exec /usr/bin/printf \"\$@\""

run() { # run <title> <env assignments...> -- prints exit code + output
  title=$1; shift
  printf '\n--- %s ---\n' "$title"
  env -i PATH="$STUB:/usr/bin:/bin" HOME="$SANDHOME" "$@" "$DASH" "$SCRIPT" 2>&1
  printf '[exit %s]\n' "$?"
}

run "T1 macOS refused"            FAKE_OS=Darwin      THURSDAY_SOURCE="$SRC"
run "T2 Windows refused"          FAKE_OS=MINGW64_NT-10.0 THURSDAY_SOURCE="$SRC"
run "T3 unknown platform refused" FAKE_OS=Plan9       THURSDAY_SOURCE="$SRC"
run "T4 /mnt home refused"        THURSDAY_HOME=/mnt/c/Users/x/.thursday THURSDAY_SOURCE="$SRC"
run "T5 home inside dsh home"     THURSDAY_HOME="$SANDHOME/.dsh/thursday" THURSDAY_SOURCE="$SRC"
run "T6 home contains dsh home"   THURSDAY_HOME="$SANDHOME"              THURSDAY_SOURCE="$SRC"
run "T7 home equals dsh home"     THURSDAY_HOME="$SANDHOME/.dsh"         THURSDAY_SOURCE="$SRC"
run "T8 DSH_HOME override honoured" DSH_HOME="$SANDHOME/custom-dsh" THURSDAY_HOME="$SANDHOME/custom-dsh/inner" THURSDAY_SOURCE="$SRC"
run "T9 node too old"             FAKE_NODE=v20.11.1  THURSDAY_SOURCE="$SRC"
run "T10 node version unparseable" FAKE_NODE=banana   THURSDAY_SOURCE="$SRC"
run "T11 THURSDAY_SOURCE has no package.json" THURSDAY_SOURCE=/tmp/dsh/work/bootstrapper2-out/nothing-here
run "T12 tilde home expanded + engine seam reported" THURSDAY_HOME='~/tilde-home' THURSDAY_SOURCE="$SRC"

printf '\n--- T13 node missing ---\n'
env -i PATH="/usr/bin:/bin" HOME="$SANDHOME" THURSDAY_SOURCE="$SRC" "$DASH" "$SCRIPT" 2>&1; printf '[exit %s]\n' "$?"

printf '\n--- T14 pnpm and corepack both missing ---\n'
rm -f "$STUB/pnpm" "$STUB/corepack"
env -i PATH="$STUB:/usr/bin:/bin" HOME="$SANDHOME" THURSDAY_SOURCE="$SRC" "$DASH" "$SCRIPT" 2>&1; printf '[exit %s]\n' "$?"
mkstub pnpm 'echo "PNPM_RAN $*"'
mkstub corepack 'echo "COREPACK_RAN $*" >&2'

printf '\n--- T15 git missing, nothing to fetch with ---\n'
rm -f "$STUB/git"
env -i PATH="$STUB:/usr/bin:/bin" HOME="$SANDHOME" THURSDAY_HOME="$SANDHOME/.thursday" "$DASH" "$SCRIPT" 2>&1; printf '[exit %s]\n' "$?"
mkstub git 'echo "GIT_RAN $*" >&2; exit 1'

printf '\n--- T16 clone attempted against the placeholder URL, failure named ---\n'
env -i PATH="$STUB:/usr/bin:/bin" HOME="$SANDHOME" THURSDAY_HOME="$SANDHOME/.thursday" "$DASH" "$SCRIPT" 2>&1; printf '[exit %s]\n' "$?"

printf '\n--- T17 happy path: exec into the engine, PID proves exec (no fork) ---\n'
mkdir -p "$SRC/packages/cli/bin"; : > "$SRC/packages/cli/bin/thursday.js"
env -i PATH="$STUB:/usr/bin:/bin" HOME="$SANDHOME" THURSDAY_SOURCE="$SRC" "$DASH" "$SCRIPT" 2>&1 &
child=$!; wait $child
printf 'HARNESS_SAW_CHILD_PID=%s\n' "$child"

printf '\n--- T18 args pass through: sh -s -- --flag ---\n'
env -i PATH="$STUB:/usr/bin:/bin" HOME="$SANDHOME" THURSDAY_SOURCE="$SRC" "$DASH" "$SCRIPT" --dry-run --preset=quick 2>&1; printf '[exit %s]\n' "$?"

printf '\n--- T19 piped-into-stdin form, no args, set -u safe ---\n'
env -i PATH="$STUB:/usr/bin:/bin" HOME="$SANDHOME" THURSDAY_SOURCE="$SRC" sh -c "cat '$SCRIPT' | '$DASH' -s" 2>&1; printf '[exit %s]\n' "$?"

printf '\n--- T20 pinned pnpm read from package.json packageManager ---\n'
rm -rf "$SRC/node_modules"
env -i PATH="$STUB:/usr/bin:/bin" HOME="$SANDHOME" THURSDAY_SOURCE="$SRC" "$DASH" "$SCRIPT" 2>&1; printf '[exit %s]\n' "$?"
mkdir -p "$SRC/node_modules"

printf '\n--- T21 engine entry missing (packages/cli placeholder today) ---\n'
rm -rf "$SRC/packages"
env -i PATH="$STUB:/usr/bin:/bin" HOME="$SANDHOME" THURSDAY_SOURCE="$SRC" "$DASH" "$SCRIPT" 2>&1; printf '[exit %s]\n' "$?"
