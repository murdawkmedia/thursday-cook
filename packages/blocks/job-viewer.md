---
id: job-viewer
title: Background job viewer
version: 1
rationale: >
  Background job output buffer, replacement job_list/job_output/job_kill
  tools, HTTP routes, completion delivery and the replacement dropdown. It
  supersedes the builtin jobs panel, which is switched off rather than removed
  so the swap is visible in one file.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/job-viewer
    from: packages/plugins/job-viewer
    what: the job viewer, linked from the workspace
dshConfig:
  - file: profiles/web/cordis.patch.yml
    rows: [job-viewer]
    placement: insert
    why: >
      One new row under its own id. The replacement mounts alongside the
      builtin and then disables it, rather than trying to reuse its id.
  - file: profiles/web/cordis.patch.yml
    rows: [ui-jobs]
    placement: override
    constraint: top-level-override
    why: >
      dsh-web-app owns the ui-jobs id, so switching the builtin panel off is a
      top-level override row. A child of the insert list with the same id
      would kill boot with "duplicate loader entry id: ui-jobs". sync.sh did
      this by editing cordis.patch.yml inside the dsh package tree; the
      profile layer composes after every bundle layer, so an override row does
      the same thing without modifying the dsh install — and survives a dsh
      upgrade.
steps:
  - action: pnpm-add
    spec: ./packages/plugins/job-viewer
  - action: patch-row
    id: job-viewer
    name: job-viewer
  - action: disable-row
    id: ui-jobs
    constraint: top-level-override
    why: >
      Two jobs panels in the session header is the visible failure; the
      invisible one is two dropdowns reading different mirrors of the same
      job list.
detect:
  - action: package-installed
    name: job-viewer
  - action: row-present
    id: job-viewer
---

# job-viewer

The fifth block, and the demonstration that adding a plugin is a block change:
this file is the entire change. No YAML is written by hand, no shell function
is edited, and the two rows it needs — one insert and one top-level override —
appear in the generated composition in the right places, with their reasons
attached.

## Why the builtin is disabled rather than replaced

A patch row cannot rename an entry, and reusing the builtin's id would mean
inserting a row with an id `dsh-web-app` already owns, which kills boot. The
supported shape is: mount the replacement under a new id, then disable the
original from the top level.
