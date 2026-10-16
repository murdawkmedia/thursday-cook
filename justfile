# Thursday — see README.md.

dist := "dist"
_landing := "site"
_experiment := "experiments/idea-expander"
_domain := "trythursday.org"
# fieber.css is Thursday's fork, kept in its own repo; fetched at build time.
_fieber := "https://github.com/trythursday/fieber.git"

# List the available recipes.
default:
    @just --list

# `just find revisit` · `just find jsr` · `just find "move JSR"`
# Search everything — hidden files and every ignored personal/ dir included.
find query:
    @rg -n -S --hidden '{{query}}' . $(find . \( -name node_modules -o -name .git \) -prune -o -type d -name personal -print)

# Discover ideas in a file (prompts; default from $IDEA_FINDER_FILE in .env).
find-idea:
    @set -a && . ./.env && bun run experiments/idea-finder.ts

# Build the static site into dist/.
site:
    #!/usr/bin/env bash
    set -euo pipefail

    rm -rf {{dist}}
    mkdir -p {{dist}}/experiments/idea-expander

    cp {{_landing}}/index.html {{dist}}/index.html
    cp {{_landing}}/AGENTS.md {{dist}}/AGENTS.md
    cp {{_experiment}}/index.html {{dist}}/experiments/idea-expander/index.html
    cp {{_experiment}}/SYSTEM_PROMPT.md {{dist}}/experiments/idea-expander/SYSTEM_PROMPT.md

    # Pull the canonical stylesheet from the fieber repo so the site always
    # builds against the fork, with no committed copy to drift.
    fieber=$(mktemp -d)
    trap 'rm -rf "$fieber"' EXIT
    git clone --depth 1 --quiet {{_fieber}} "$fieber"
    cp "$fieber/fieber.css" {{dist}}/fieber.css

    touch {{dist}}/.nojekyll

    # GitHub Pages reads this to serve the custom domain.
    printf '%s\n' {{_domain}} > {{dist}}/CNAME

# Publish dist/ to the `site` branch, which GitHub Pages serves.
publish: site
    #!/usr/bin/env bash
    set -euo pipefail
    root=$(git rev-parse --show-toplevel)
    branch=site
    base=$(mktemp -d)
    wt="$base/$branch"
    trap 'git -C "$root" worktree remove --force "$wt" >/dev/null 2>&1 || true; rm -rf "$base"' EXIT

    git -C "$root" worktree prune
    # GitHub commits to this branch directly (e.g. when the custom domain is
    # set), so track the remote and rebuild on top of whatever is there.
    git -C "$root" fetch --quiet origin "$branch" || true
    if git -C "$root" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
        git -C "$root" branch -f "$branch" "origin/$branch"
    fi
    if git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
        git -C "$root" worktree add --force "$wt" "$branch"
    else
        git -C "$root" worktree add --force --detach "$wt" HEAD
        git -C "$wt" checkout --orphan "$branch"
    fi

    find "$wt" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
    cp -R "{{dist}}/." "$wt/"

    git -C "$wt" add -A
    git -C "$wt" commit -m "site: rebuild from $(git -C "$root" rev-parse --short HEAD)"
    git -C "$wt" push origin "$branch"
