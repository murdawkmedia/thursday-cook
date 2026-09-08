---
id: thursday-defaults
title: Thursday defaults (settings and preset)
version: 2
rationale: >
  The settings file and the standard preset Thursday ships: the active profile,
  and the subagent routing every delegated agent inherits.
dependsOn: [dsh-runtime, llm-pi-ai]
modifies:
  - file: settings.yaml
    key: profile.active
    constraint: no-yaml-round-trip
    why: >
      Patch the single line, byte-preserving. A full YAML round-trip lets a
      YAML 1.1 reader (PyYAML) rewrite the file and mangle the reasoningEfforts
      key `off:` into the boolean false, which the llm-pi-ai schema then
      rejects, and every pi-ai provider silently disappears.
  - file: presets/standard.yaml
    key: tools.tool-subagent.config.agentOptions
    constraint: nested-tool-config
    why: >
      agentOptions is a field of the tool's OWN config: dsh-tool-subagent
      declares it inside its Config schema and reads config.agentOptions, so it
      must nest inside `config:` rather than sit beside it. A sibling key is
      parsed and then ignored, which silently leaves every child inheriting the
      orchestrator's creation route.
steps:
  - action: copy-tree
    from: config/settings.yaml
    to: settings.yaml
    why: >
      The settings template moved out of the old home/ staging tree into
      config/ (see the migration map), so this step copies that one template
      file — not a home/settings directory, which no longer exists. There is
      no presets template to copy beside it: presets/standard.yaml is created
      by the write-settings-key step below, which is why that action creates a
      missing file rather than failing on it.
  - action: write-settings-key
    file: settings.yaml
    key: profile.active
    value: thursday
    constraint: no-yaml-round-trip
    why: >
      Byte-preserving line patch only; a round-trip drops comments, rewrites
      indentation, and turns `off:` into a boolean.
  - action: write-settings-key
    file: presets/standard.yaml
    key: tools.tool-subagent.config.agentOptions
    value:
      provider: deepseek
      model: deepseek-chat
    constraint: nested-tool-config
    why: >
      Written inside the row's config block, where dsh-tool-subagent reads it.
detect:
  - action: settings-key-equals
    file: settings.yaml
    key: profile.active
    value: thursday
  - action: settings-key-equals
    file: presets/standard.yaml
    key: tools.tool-subagent.config.agentOptions.provider
    value: deepseek
---

# thursday-defaults

Two files, both of which someone else may have edited by hand, so both are
patched by key rather than rewritten.

## The `off:` trap

`settings.yaml` carries a reasoningEfforts map whose keys include `off`. YAML
1.1 treats `off` as a boolean, so any reader on that version turns the key into
`false` on the way out. The llm-pi-ai schema then rejects the file and every
pi-ai provider disappears, with no error that mentions YAML. Nothing may
round-trip this file — not to reformat it, not to sort it, not to validate it.

## agentOptions

The nesting is the whole subtlety: beside `config:` it parses and does nothing.
The symptom is subagents that quietly run on the orchestrator's model, which
looks like a routing bug and is a two-space indentation bug.
