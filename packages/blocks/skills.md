---
id: skills
title: The skill set
version: 1
rationale: >
  The general skills Thursday ships, copied tree-and-all into the Thursday
  home's skills directory. Skills are discovered live on the next session, so
  this block needs no composition change and no restart beyond what the other
  blocks already require. Without it every skill-gated tool stays gated behind
  a skill that does not exist.
dependsOn: [dsh-runtime]
installs:
  - path: skills
    from: skills
    what: the general skill set, one directory per skill
steps:
  - action: copy-tree
    from: skills
    to: skills
    why: >
      Copied as a whole tree, not file by file, because a skill is a directory
      with its own SKILL.md and assets and skills are added and pruned as
      whole units. Prune stays off: a user dropping a personal skill in
      alongside must not have it eaten by the next install.
detect:
  - action: path-exists
    path: skills
---

# skills

The skills directory under the Thursday home, populated from this repository's
own `skills/` tree.

## Why a copy and not a link

The home is meant to be removable as a unit and inspectable without this
repository present. A link would make the installed set depend on where the
checkout sits, which is exactly the state sync.sh's copy avoided.

## Why no prune

copy-tree's prune defaults to off, deliberately. sync.sh's `cp -r` never
deleted anything either: the skills directory is the one place under the home
a user is expected to add their own material. A future explicit prune is a
block change, not a silent default.

## What this block does not install

The aidos skills are installed by the aidos block into `skills/aidos`, from
the pinned commit rather than from this tree — that block owns the pin and
the panic when the commit is missing. The two blocks write into the same
parent directory and nowhere the same file, so they compose; deleting this
block leaves the aidos skills, and deleting that one leaves these.

## What to check when it goes wrong

A skill that shows up in the catalog but refuses to load usually means its
directory landed without its SKILL.md, which a partial copy produces. Skills
are discovered live, so a fix is visible on the next session without a
restart.
