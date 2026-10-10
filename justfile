# Thursday — see README.md.

_site := "_site"
_source := "prototypes/idea-expander"
_domain := "trythursday.org"

# List the available recipes.
default:
    @just --list

# Build the static site into _site/.
site:
    rm -rf {{_site}}
    mkdir -p {{_site}}
    cp {{_source}}/index.html {{_site}}/index.html
    cp {{_source}}/SYSTEM_PROMPT.md {{_site}}/SYSTEM_PROMPT.md
    touch {{_site}}/.nojekyll
    # GitHub Pages reads this to serve the custom domain.
    printf '%s\n' {{_domain}} > {{_site}}/CNAME

# Publish _site/ to the `site` branch, which GitHub Pages serves.
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
    cp "{{_site}}/index.html" "$wt/index.html"
    cp "{{_site}}/SYSTEM_PROMPT.md" "$wt/SYSTEM_PROMPT.md"
    cp "{{_site}}/.nojekyll" "$wt/.nojekyll"
    cp "{{_site}}/CNAME" "$wt/CNAME"

    git -C "$wt" add -A
    git -C "$wt" commit -m "site: rebuild from $(git -C "$root" rev-parse --short HEAD)"
    git -C "$wt" push origin "$branch"
