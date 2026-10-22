# Thursday — see README.md.

dist := "dist"
_landing := "site"
_experiment := "experiments/next-steps"
_domain := "trythursday.org"

# List the available recipes.
default:
    @just --list

# `just find revisit` · `just find jsr` · `just find "move JSR"`
# Search everything — hidden files and every ignored personal/ dir included.
find query:
    @rg -n -S --hidden '{{query}}' . $(find . \( -name node_modules -o -name .git \) -prune -o -type d -name personal -print)

# Discover ideas in a file (prompts; default from $IDEA_FINDER_FILE in .env).
find-idea:
    @set -a && . ./.env && bun run scripts/idea-finder.ts

# Build the static site into dist/.
site:
    #!/usr/bin/env bash
    set -euo pipefail

    rm -rf {{dist}}
    mkdir -p {{dist}}/experiments/next-steps

    cp {{_landing}}/AGENTS.md {{dist}}/AGENTS.md
    bun run scripts/home.ts
    cp {{_experiment}}/index.html {{dist}}/experiments/next-steps/index.html
    cp {{_experiment}}/SYSTEM-PROMPT.md {{dist}}/experiments/next-steps/SYSTEM-PROMPT.md
    cp {{_experiment}}/EXAMPLES.toml {{dist}}/experiments/next-steps/EXAMPLES.toml
    cp {{_experiment}}/style.css {{dist}}/experiments/next-steps/style.css
    cp -R {{_experiment}}/lib {{dist}}/experiments/next-steps/lib

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
