# packages/blocks

One plugin block definition per Thursday component.

## Known exclusions

Components sync.sh installs that deliberately have no block, each with its
reason, so "missing" and "decided against" are distinguishable:

- `dsh-web-tools` — installed by sync.sh (line 280): multi-provider
  web_search/web_fetch with a Settings card. Not blocked here pending a real
  decision: v0.1 either gives it a block (pinned-unreviewed until someone
  reads the package) or drops it in favour of dsh's builtin tool-web. The
  candidate record and the corrected history live in
  `config/plugin-roster.json` under candidates; the decision is P5's, and it
  must be made with the package actually fetched and read.
- The preset-plane patches, the dsh runtime itself, and the fs-sandbox patch
  are not exclusions but deferrals, recorded in `docs/dsh-home.md`'s
  sync.sh artifact table with their owning tickets.
