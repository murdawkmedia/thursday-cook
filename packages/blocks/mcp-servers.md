---
id: mcp-servers
title: MCP server ownership
version: 1
rationale: >
  The one plugin that owns every MCP server, both transports and the OAuth
  login. Its roster is mcp-servers.json under the Thursday home, which the
  installer copies and the plugin reads; without this block there is no way to
  add a server that needs a browser login, because every third-party MCP
  manager on npm and GitHub is a cordis.patch.yml editor that delegates to
  dsh-mcp-client and cannot run one.
dependsOn: [dsh-runtime]
installs:
  - path: profiles/web/node_modules/mcp-servers
    from: packages/plugins/mcp-servers
    what: the MCP server manager, self-mounted from its own cordis.patch.yml
  - path: mcp-servers.json
    from: config/mcp-servers.json
    what: the server roster the plugin reads
integrations:
  - name: nostrbook
    kind: mcp-server
    requiresCredentials: false
    why: Nostr protocol facts; stdio via npx.
  - name: gitlab
    kind: mcp-server
    requiresCredentials: true
    why: GitLab issues and merges; stdio via glab, which needs the user's own glab auth.
  - name: easyeda
    kind: mcp-server
    requiresCredentials: false
    why: PCB design data out of EasyEDA Pro; stdio via npx, tool profile "core".
  - name: blinkit
    kind: mcp-server
    requiresCredentials: false
    why: Delivery order history; stdio via a local node install.
  - name: swiggy-food
    kind: mcp-server
    requiresCredentials: true
    why: Delivery order history; HTTP transport, OAuth login handled by this plugin.
  - name: swiggy-instamart
    kind: mcp-server
    requiresCredentials: true
    why: Grocery order history; HTTP transport, OAuth login handled by this plugin.
  - name: zepto
    kind: mcp-server
    requiresCredentials: true
    why: Delivery order history; HTTP transport, OAuth login handled by this plugin.
sideEffects:
  - what: >
      The plugin owns the OAuth tokens and connection state for the HTTP
      servers in its roster and writes them beside the roster file.
    where: mcp-servers.json and its siblings under the Thursday home
    why: >
      The whole reason this plugin exists is that a browser login cannot be
      run by a patch-file editor; the tokens are the product of that login.
    undoneByRemovingHome: true
steps:
  - action: pnpm-add
    spec: ./packages/plugins/mcp-servers
  - action: copy-tree
    from: config/mcp-servers.json
    to: mcp-servers.json
    why: >
      Git owns the roster, so the panel never writes it and a re-install
      overwrites it every run — the same rule sync.sh's step_sync_mcp_config
      stated. The personal half of the roster (the author's own accounts and
      shopping servers) is the user's to edit after install.
detect:
  - action: package-installed
    name: mcp-servers
  - action: path-exists
    path: mcp-servers.json
---

# mcp-servers

One registrar for every MCP server.

## Why this plugin and not a manager

Every MCP manager plugin published to npm or GitHub is a visual editor for
cordis.patch.yml that delegates the actual connection to dsh-mcp-client. None
of them can run a browser login, which is what the HTTP servers (Swiggy,
Zepto) require. This plugin owns the connection itself: both transports, the
OAuth flow, the connection state.

## Why the builtin rows are gone

The built-in dsh-mcp-client composition rows were removed, not supplemented.
Two registrars for one server name would register each tool twice, and the
duplicate is invisible until a tool call answers from the wrong connection.
The plugin mounts its own row from its own cordis.patch.yml, so this block
installs the package and the roster and writes no row.

## What to check when it goes wrong

A server missing from the tool list usually means its roster entry is missing
or its transport changed in mcp-servers.json; the file is the single source,
and editing a patch will not add it. An OAuth server that logs in but comes
back empty usually means stale connection state beside the roster file —
removing the Thursday home removes the tokens with it.
