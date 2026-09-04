# The Thursday UI contract

> Status: specification for TH0. This document describes the extension
> surfaces Thursday's UI offers to plugins, the data each accepts, and the
> check that keeps all of them on one vocabulary. It is a contract: a
> contributor should be able to write a contribution from this document alone,
> without reading Thursday's source.

## The central decision

**Every extension point is data-in. Thursday renders; plugins never do.**

A slot accepts typed data — a label, an icon name, a state, an action id — and
Thursday itself turns that data into markup using its own component vocabulary.
No slot accepts a rendered component, a JSX element, a class name, or a
stylesheet.

This decision is settled. It is recorded here because everything below is a
consequence of it:

- **Native by construction.** A contribution cannot look foreign, because the
  contributor never writes markup. The worst a plugin can do visually is
  supply a bad label; it cannot supply a bad button.
- **The schema is the API.** Since Thursday renders, the shape of each slot's
  data is a public contract with the same status as a route or a token name.
  Each surface below specifies it exactly: every field, its type, who renders
  it, and what happens when it is missing or malformed.
- **Upgrades are safe.** Thursday can re-skin, re-flow, or re-implement any
  surface without breaking a single plugin, because no plugin depends on
  Thursday's DOM.
- **Rejections are loud.** Malformed data is rejected **at registration**, with
  an error message naming the contributing plugin. A slot never renders a
  partial or silently-dropped contribution: if a tab's icon name is not in the
  icon set, registration fails with `plugin "log-exporter": tab icon "download2"
  is not a Thursday icon name` — not a tab with a blank square.

The cost is stated honestly in one sentence, for every future contributor who
hits the wall:

> **Thursday constrains slots because unity and extensibility pull against each
> other: anything a plugin could render itself could break the one-product
> feel, so extensibility is bought with data, and expressiveness is bought with
> new *fields* in a schema — propose one, don't smuggle in markup.**

## The vocabulary the schemas name

Contributed data names Thursday components and tokens; it never names CSS.
The vocabulary (mirroring `website/src/site/components.ts`, the web-site
statement of the same idea):

- **panel** — a titled container (`radius-container`, hairline border)
- **callout** — a tone-bearing notice (`info | warning | error`)
- **badge** — a status pill, tone `neutral | success | warning | error | info`
- **chip** — a small labelled tag (control radius, `border-strong` outline)
- **button** — variant `primary | secondary | ghost | danger`
- **table** — captioned columns of rows
- **icon** — by name, from Thursday's icon set (see "Icons", below)
- **text** — primary or muted

Two radii, two borders, one accent: everything a schema can say resolves onto
the 19 tokens in `packages/tokens`. There is no schema field that takes a raw
colour, length, radius, or class.

### Icons

Schemas reference icons **by name**, from the Thursday icon set (`packages/
icons`, generated sprite; names are lowercase, hyphenated: `download`,
`shield`, `terminal`, …). A name not in the set is a registration error. This
is deliberate: accepting SVG path data would be accepting rendering.

---

## Surface 1 — The tab bar (TH5's badges)

**Who renders it:** Thursday's top-bar component. A plugin contributes a tab;
Thursday renders it as a badge-styled tab per TH5, with an icon, centred in
the bar.

**Registration:** `thursday.registerTab(contribution)` from a host plugin, or
the `thursday.tabs` data slot from a client plugin.

**Schema:**

```ts
interface TabContribution {
  /** Stable id. Duplicates (including Thursday's own three tabs) are a
   *  registration error naming both plugins. */
  id: string;              // /^[a-z][a-z0-9-]*$/
  /** Tab label as rendered. Plain text; no markup, no interpolation. */
  label: string;           // 1..24 chars after trim
  /** Icon name from the Thursday icon set. Required: TH5 gives every tab
   *  an icon, so a tab without one is malformed, not optional. */
  icon: IconName;
  /** Target view: which panel the tab activates. Must be a registered
   *  panel id (Surface 5) or a built-in view id ("session", "trajectory",
   *  "settings"). A dangling target is a registration error. */
  target: PanelId | BuiltinViewId;
  /** Optional live badge state. May be updated after registration via
   *  thursday.setTabBadge(id, badge). Absent → no badge is rendered. */
  badge?: TabBadge;
  /** Render order hint. Thursday's own tabs pin 0..99; plugins sort after,
   *  in registration order for ties. Not a pixel position. */
  order?: number;          // default 100
}

interface TabBadge {
  /** Short text in the badge. Numbers are strings like everything else. */
  label: string;           // 1..6 chars; longer is a registration error
  /** Badge tone. Maps directly to the badge component's tone. */
  tone: "neutral" | "info" | "success" | "warning" | "error";
}
```

**Rendering, field by field:** `label` → tab badge text, `foreground` on
`background-elevated`; `icon` → 16px icon, `foreground-muted`, promoted to
`accent` when the tab is active; `badge.label` → the **badge** component at
`badge.tone`; `target` → wired to the panel router. Active-tab accent comes
from the `accent` token; a tab cannot pick its own.

**Missing/malformed:** every field above is validated at registration. Empty
or overlong `label`, unknown `icon`, dangling `target`, `badge.label` over 6
chars — each is a thrown registration error naming the plugin. A contribution
is all-or-nothing; Thursday never renders half a tab.

---

## Surface 2 — The composer menu

**Prior art examined:** `dotfiles-ai/plugins/composer-menu` (the composer
overflow menu). Its shape: the client plugin registers into dsh's
`conversation.input.left` slot and *declares a child slot*,
`composer.overflow.item: { kind: "list", scope: "session" }`, which other
plugins fill. Critically, **that child slot is component-in**: another plugin
registers a React element into it, and the menu mounts whatever arrives inside
a `display: contents` measuring div. The plugin even documents the fragility
this creates — it needs a `MutationObserver` to know whether the slot is
empty, a hardcoded `renderSlot` guard because a dropped declaration would
crash the menu, and shipped-class sniffing to hide the replaced controls.

**Verdict: adopt the discovery pattern, reject the contribution model.**
What transfers to Thursday: slots are declared with an id and an owner; an
empty slot renders nothing (no orphan separators); the menu owns its rows'
layout (fixed icon column, label, trailing mark). What Thursday changes: the
child slot accepts **data, not elements**. The `MutationObserver` exists in
the prior art precisely because rendered children cannot be introspected; with
typed data the menu knows at registration time exactly what it will render,
can validate it, can measure nothing, and can never crash on a contributor's
bad render. The prior art's own comments are the evidence for the change.

**Who renders it:** Thursday's composer-menu surface.

**Schema:**

```ts
interface ComposerMenuItem {
  id: string;              // unique, /^[a-z][a-z0-9-]*$/
  label: string;           // 1..32 chars
  icon?: IconName;         // absent → leading column stays, empty, so
                           // labels keep their column alignment (adopted
                           // from the prior art's row layout)
  /** What choosing the row does. Exactly one of:
   *  - action: a registered Thursday action id (Surface 5 semantics)
   *  - toggle: contributes a boolean setting; Thursday renders a check
   *    indicator bound to it */
  action?: ActionId;
  toggle?: SettingId;
  /** Optional subdued hint line under the label, muted text. */
  hint?: string;           // ≤ 48 chars
  /** Danger rows render with the danger variant's colour and get a
   *  confirm step. Default false. */
  danger?: boolean;
}
```

Rendering: row → composer-menu row (icon column, label, hint, check mark for
toggles, chevron never — Thursday's menu has no submenus in v1). `danger:
true` → `error`-toned label and a confirmation modal before the action fires.
Both `action` and `toggle` present, or neither, is a registration error.

---

## Surface 3 — Tool-call cards

A plugin that registers a tool may contribute a **card spec** describing how
Thursday displays that tool's calls. The data describes the card; Thursday
renders it. This is the purest form of the central decision: the plugin knows
its tool's fields, Thursday owns every pixel.

**Schema:**

```ts
interface ToolCardSpec {
  /** The tool name this spec describes. One spec per tool; a second
   *  registration for the same tool is an error naming both plugins. */
  tool: string;
  /** Card title. Default: the tool name. */
  title?: string;
  /** Ordered list of fields. Rendered top to bottom (or left to right in
   *  the compact header row for `kind: "inline"` fields). Order here is
   *  render order; there is no separate position field. */
  fields: ToolCardField[];   // 1..8 fields; empty is an error
  /** How the card's success/failure is signalled. Default: from the call's
   *  own status, via the badge component. */
  statusBadge?: boolean;     // default true
}

type ToolCardField =
  | { kind: "text";     label: string; from: string; muted?: boolean }
  // `from` is a JSON-path into the tool call's input (or output with the
  // `of: "output"` variant). Thursday resolves it; unresolved → the field
  // is omitted, never rendered empty — EXCEPT when the whole spec fails
  // to match any call, which cannot happen since specs bind to a tool.
  | { kind: "code";     label: string; from: string; of?: "input" | "output" }
  | { kind: "diff";     label: string; from: string; of?: "input" | "output" }
  | { kind: "badge";    label: string; from: string;
        map: Record<string, BadgeTone> }  // unmatched values → neutral
  | { kind: "status";   label: string }   // the call's own status badge
```

**Rendering:** the card is Thursday's tool-call block (`radius-container`);
`title` in the header; each field by kind — `text` → **text** (muted flag →
muted), `code` → the **code** treatment (`code` token), `diff` → the applied-
diff block (`success`/`error` line colours), `badge` → the **badge**
component with the mapped tone, `status` → the standard status **badge**.
Labels render as muted text above or beside the value.

**Missing/malformed:** the spec is validated when the tool registers: unknown
field `kind`, more than 8 fields, a `map` value that is not a `BadgeTone`, a
`from` path that is not a valid JSON-path — registration error naming the
plugin. A path that is *valid but unresolved for a particular call* is not an
error: that field is omitted for that call (data varies per call; the schema
cannot know). A spec that renders *nothing* for every call — all fields
unresolved — still renders the titled card with a muted "no detail" line, so
the call is never invisible.

---

## Surface 4 — The sidebar

Plugin-contributed entries in Thursday's sidebar, near the aidos tickets
button. Future dashboards (N12) mount here; the schema is fixed now so N12
arrives as data, not as a new mechanism.

**Schema:**

```ts
interface SidebarEntry {
  id: string;              // /^[a-z][a-z0-9-]*$/
  label: string;           // 1..20 chars
  icon: IconName;          // required — sidebar rows are icon-led
  /** Which panel opens when clicked. Must be registered (Surface 5). */
  panel: PanelId;
  /** Optional live count, rendered as a badge at the row's right edge.
     Updated via thursday.setSidebarCount(id, n | null). */
  count?: number | null;
  order?: number;          // default 100; Thursday's own entries pin 0..99
}
```

Rendering: a sidebar row — icon (muted, `accent` when active), label, optional
**badge** with the count (≥ 100 renders `99+`); `panel` wired to the panel
router; active state from the router, never from the contribution. Entries
sort after Thursday's own, by `order` then registration order.

**Missing/malformed:** same regime — registration error naming the plugin for
bad ids, unknown icons, unregistered panels, negative counts.

---

## Surface 5 — Workspace panels and modals

Plugins can open content **in** Thursday's chrome, but the content itself is
Thursday-rendered from data. A panel is a registered region a tab or sidebar
entry can target; a modal is a transient panel.

**Schema:**

```ts
interface PanelContribution {
  id: string;              // /^[a-z][a-z0-9-]*$/ — the PanelId other slots name
  title: string;           // panel header, 1..48 chars
  /** The panel's body: a block list, not markup. */
  blocks: PanelBlock[];    // 1..32 blocks
}

type PanelBlock =
  | { kind: "text";     body: string; muted?: boolean }
  | { kind: "callout";  tone: "info" | "warning" | "error"; title: string; body: string }
  | { kind: "table";    caption?: string; head: string[]; rows: string[][] }
  | { kind: "fields";   items: { label: string; value: string; code?: boolean }[] }
  | { kind: "list";     items: string[]; ordered?: boolean }
  | { kind: "actions";  buttons: { label: string; action: ActionId;
        variant?: "primary" | "secondary" | "ghost" | "danger" }[] }

interface ModalRequest {
  /** Rendered as a panel over the workspace; dismissible; one at a time
   *  (a second request while one is open is queued, not stacked). */
  panel: PanelContribution;
  /** Modal width step, not pixels. */
  size?: "small" | "medium" | "large";   // default "medium"
}
```

**Rendering, field by field:** `title` → panel header; `text` → paragraph
(primary or muted); `callout` → the **callout** component; `table` → the
**table** component (all cells plain text — a cell cannot be a button); 
`fields` → label/value rows, `code: true` → code treatment; `list` → ul/ol;
`actions` → the **button** component per entry, variant as given (default
`secondary`), wired to registered actions.

**Missing/malformed:** validated at registration for panels (at request time
for modals): unknown block `kind`, empty `blocks`, `table` rows of uneven
length against `head` (padded with empty strings is *not* done — it is an
error; silent misalignment is worse), unknown `ActionId`, unknown button
`variant`. Errors name the plugin.

**The limit, stated:** a plugin cannot get arbitrary DOM into a panel. If a
plugin needs something no block kind expresses, the v1 answer is to propose a
new block kind upstream — not to fork the panel renderer.

---

## Surface 6 — Status and badge chips in the chrome

Any plugin may publish a status chip that Thursday places in the chrome (the
header's status region, and any future status strip). This is how integrations
show "lint: 3 warnings" or "tunnel: up" without owning any pixels.

**Schema:**

```ts
interface StatusChip {
  id: string;              // /^[a-z][a-z0-9-]*$/
  label: string;           // 1..24 chars
  tone: "neutral" | "info" | "success" | "warning" | "error";
  /** Optional detail; shown in the chip's tooltip and nowhere else. */
  detail?: string;         // ≤ 120 chars
  /** Optional click-through to a registered panel. */
  panel?: PanelId;
  /** Sort hint among chips; ties break by registration order. */
  order?: number;          // default 100
}
```

**Rendering:** the **chip** component, tone mapped to its text/border
treatment (chip is `border-strong`-outlined, control radius — the secondary-
control rule), tooltip from `detail`, click navigates to `panel`. Live updates
via `thursday.setChip(id, patch | null)`; `null` removes the chip. The same
validation regime applies on every update — a bad update is rejected with the
plugin's name and the **previous** chip state stays rendered; a chip never
flickers into nothing.

---

## The consistency check

The vocabulary is enforceable because everything user-visible resolves to a
token or a named component. The check is a Vitest suite alongside the existing
`website/tests/site.test.ts` guard rails, run over **every surface Thursday
renders**: Thursday's own stylesheets and every registered contribution
(specs are data, so they can be inspected without rendering).

What it inspects:

1. **No raw colours anywhere.** Every `.ts/.tsx/.css/.js` file in Thursday's
   UI tree (plugins included) is scanned for hex literals and `rgb(`/`hsl(`
   functions, outside `packages/tokens`. Any colour must arrive as
   `tokens.*` or `var(--th-*)`.
2. **Only listed radii.** Every `border-radius` declaration must reference
   `var(--th-radius-control)` or `var(--th-radius-container)` — no other
   value, no literals, no third radius.
3. **Controls come from the vocabulary.** Every rendered interactive element
   carries a vocabulary class (`btn`, `chip`, `tab`, `sidebar-row`, …). The
   check renders each registered contribution through Thursday's renderer and
   asserts the emitted markup contains only vocabulary classes and no
   `style=` attribute, no inline SVG (icons arrive as names and render from
   Thursday's set), and no class that is not in the vocabulary list.
4. **The load-bearing distinctions hold.** As in the site tests: controls use
   `radius-control`, containers use `radius-container`, secondary controls are
   outlined in `border-strong` (never the hairline `border`), chrome dividers
   use the hairline, and exactly one focus ring exists, from `var(--th-focus)`.

Worked example (the site-test pattern, applied to contributions):

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TOKEN_NAMES } from "@thursday/tokens";
import { describe, expect, it } from "vitest";

import { contributions } from "../src/contributions";   // every registered
import { renderPanel, renderSidebar } from "../src/render"; // Thursday's renderers

const VOCAB = new Set([
  "panel", "panel__header", "panel__title", "panel__body",
  "callout", "badge", "chip", "btn", "table", "tab",
  "sidebar-row", "sidebar-row__icon", "sidebar-row__label",
  "composer-menu-row", "composer-menu-icon", "composer-menu-label",
  "tool-card", "field-label",
]);

describe("every contribution renders inside the vocabulary", () => {
  it.each(contributions.panels())("panel $id emits only vocabulary markup", (p) => {
    const markup = renderPanel(p);
    for (const cls of markup.matchAll(/class="([^"]+)"/g)) {
      for (const name of (cls[1] ?? "").split(/\s+/)) {
        expect(VOCAB, `plugin "${p.plugin}" emitted class "${name}"`).toContain(name);
      }
    }
    expect(markup).not.toMatch(/style="/);          // no inline styles
    expect(markup).not.toMatch(/<svg/);             // icons are names, not paths
  });

  it("no stylesheet anywhere names a raw colour or an unlisted radius", () => {
    const files = uiTreeFiles();                    // Thursday UI + plugin css
    for (const file of files) {
      const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      for (const m of css.matchAll(/border-radius:\s*([^;]+);/)) {
        expect(["var(--th-radius-control)", "var(--th-radius-container)"],
          `${file}: ${m[1]}`).toContain((m[1] ?? "").trim());
      }
    }
  });
});
```

### The deliberately non-conforming contribution (a test that must fail)

Kept in the suite as a negative control, using `expect(() => …).toThrow` so
the suite stays green while proving the rejection works:

```ts
describe("the check catches a non-conforming contribution", () => {
  it("rejects a sidebar entry that smuggles in its own colour and icon", () => {
    expect(() =>
      thursday.registerSidebar("rogue", {
        id: "rogue-panel",
        label: "Rogue",
        icon: "not-an-icon" as IconName,     // unknown icon name
        panel: "rogue.unregistered" as PanelId, // dangling panel
        // @ts-expect-error — a raw colour has no field to live in; a
        // contributor reaching for one proves the schema must reject it
        color: "#ff00ff",
      }),
    ).toThrow(/plugin "rogue"/);   // the message names the plugin
  });

  it("fails if a rendered panel ever escapes the vocabulary", () => {
    const rogue = { plugin: "rogue", id: "x", title: "X", blocks: [
      { kind: "text", body: "hi" },
    ] } as unknown as PanelContribution;
    // Simulate a renderer bug that leaks a raw class; the check must see it.
    const markup = renderPanel(rogue).replace('class="panel"', 'class="panel rogue-custom"');
    for (const cls of markup.matchAll(/class="([^"]+)"/g)) {
      for (const name of (cls[1] ?? "").split(/\s+/)) {
        expect(VOCAB).toContain(name);   // fails on "rogue-custom"
      }
    }
  });
});
```

---

## What this contract does NOT cover

- **Third-party themes.** No theme mechanism exists in v1 and none is
  specified here. Recolouring happens one way: overriding the `--th-*`
  custom properties, which the token system's alias structure
  (`accent` → `brand-orange`) is designed to survive. A "theme" that wants
  more than token overrides does not exist in v1.
- **Full custom panels outside Thursday's chrome.** This does not exist in
  v1 — by the central decision, there is no surface where a plugin renders
  free-form UI. A plugin wanting a bespoke experience today must ship it as a
  separate page (its own route, its own responsibility, outside Thursday's
  chrome), which this contract neither specifies nor blesses.
- **Dynamic schemas.** Schemas above are versioned with Thursday. There is no
  mechanism for a plugin to extend a schema at runtime; new fields are
  proposed as changes to this document.
- **Submenus, context menus, drag-and-drop, per-item styling** in the composer
  menu and sidebar: not in v1. The schemas say so by omission.

---

## Inventions recorded

Places where no surface existed yet and this document had to invent:

1. **The icon set and name registry** (`packages/icons`, hyphenated names) —
   referenced by TH5 ("every tab carries an icon") but no icon package exists
   in the repo yet. Every icon-typed field depends on it.
2. **The registration API shape** (`thursday.registerTab/registerSidebar/
   registerToolCard/registerPanel`, `setTabBadge/setSidebarCount/setChip`) —
   no plugin-facing registration service exists yet; the names here are the
   proposal.
3. **Panel ids and the panel router** — sidebar entries, tabs, chips and
   modals all target a `PanelId`, but no panel registry exists. N12
   (dashboards) is assumed to mount as panels here, per the task framing.
4. **`ActionId` / `SettingId`** — the composer menu's `action` and `toggle`
   fields need a registered-action and registered-setting namespace; neither
   exists yet.
5. **`border-strong`** — the site tests (`website/tests/site.test.ts`) assert
   secondary controls are outlined in `var(--th-border-strong)` and chrome in
   the hairline, but the token README's 19-token table lists only `border`.
   Either a 20th token is planned or the test names a token that does not
   resolve; this contract follows the tests and flags the discrepancy for the
   tokens ticket.
6. **Status-chip chrome region** — Surface 6's placement ("header's status
   region") is invented; TH5 fixes the header's other residents but no status
   strip is specified anywhere.
7. **Builtin view ids** (`"session"`, `"trajectory"`, `"settings"`) for tab
   targets — inferred from TH5's three tabs and its "Trajectory → Session log"
   relabel; the canonical id list must be pinned by the top-bar ticket.
