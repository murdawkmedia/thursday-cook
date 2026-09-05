/**
 * The design-system page.
 *
 * Every swatch, name, value and comment on it is read out of
 * `@trythursday/tokens` at build time, so the page cannot describe a token set
 * that no longer exists: add a token upstream and it appears here; change a
 * value and the number under the swatch changes with it. Nothing on this page
 * is transcribed by hand.
 */
import {
  TOKENS,
  TOKEN_NAMES,
  compositeOver,
  contrastRatio,
  cssVar,
  isAlias,
  isHexColor,
  relativeLuminance,
  tokens,
  type TokenName,
} from "@trythursday/tokens";

import { badge, button, callout, chip, field, kbd, panel, table, tabs } from "../components";
import { html, join, type Html } from "../html";
import { renderPage } from "../layout";

/** The eight steps of the type scale, paired with the class that shows them. */
const TYPE_SCALE: readonly { variable: string; px: string; role: string; sample: string }[] = [
  { variable: "--web-text-display", px: "48px", role: "Display", sample: "Ship on Thursday" },
  { variable: "--web-text-h1", px: "36px", role: "Heading 1", sample: "A design system" },
  { variable: "--web-text-h2", px: "27px", role: "Heading 2", sample: "Surfaces and shape" },
  { variable: "--web-text-h3", px: "21px", role: "Heading 3", sample: "Controls and chrome" },
  {
    variable: "--web-text-lead",
    px: "18px",
    role: "Lead",
    sample: "The line that carries a section.",
  },
  {
    variable: "--web-text-body",
    px: "15px",
    role: "Body",
    sample: "Body copy, and the size every control's label is set at.",
  },
  {
    variable: "--web-text-small",
    px: "13px",
    role: "Small",
    sample: "Captions, hints, table cells, dense chrome.",
  },
  { variable: "--web-text-micro", px: "11px", role: "Micro", sample: "EYEBROWS · META · BADGES" },
];

function typeSpecimens(): Html {
  return join(
    TYPE_SCALE.map(
      (step) =>
        html`<div class="specimen">
          <p class="specimen__meta">${step.role}<br />${step.px}<br />${step.variable}</p>
          <p class="specimen__sample" style="font-size: var(${step.variable}); line-height: 1.2">
            ${step.sample}
          </p>
        </div>`,
    ),
  );
}

/**
 * The one measurement that is actually meaningful for this token, computed by
 * the token package's own colour functions. A contrast ratio is the right
 * figure for ink and for boundaries; it is not the right figure for the canvas
 * against itself, for the surface ladder (whose separation is stated in
 * luminance, because near black the ratio cannot tell a usable step from an
 * invisible one), or for a translucent fill measured before compositing.
 */
function measurement(name: TokenName): string {
  const value = tokens[name];
  if (!isHexColor(value)) return "—";
  if (name === "background") return "the canvas";
  if (name.startsWith("background-")) {
    const step = relativeLuminance(value) - relativeLuminance(tokens.background);
    return `+${step.toFixed(4)} luminance over the canvas`;
  }
  if (name === "selection") {
    const behind = compositeOver(value, tokens.background);
    return `text stays at ${contrastRatio(tokens.foreground, behind).toFixed(2)}:1 under it`;
  }
  return `${contrastRatio(value, tokens.background).toFixed(2)}:1 on the canvas`;
}

function swatch(name: TokenName): Html {
  const definition = TOKENS[name];
  const shown = isAlias(definition) ? `→ ${definition.aliasOf}` : tokens[name];
  return html`<div class="swatch">
    <span class="swatch__chip" style="background: ${cssVar(name)}"></span>
    <span>
      <span class="swatch__name">${name}</span><br />
      <span class="swatch__value">${shown} · ${measurement(name)}</span>
    </span>
  </div>`;
}

const COLOUR_TOKENS = TOKEN_NAMES.filter((name) => !name.startsWith("radius-"));
const SHAPE_TOKENS = TOKEN_NAMES.filter((name) => name.startsWith("radius-"));

function tokenTable(): Html {
  return table({
    caption: "Read from @trythursday/tokens at build time, comments included.",
    head: ["Token", "Value", "Intended use"],
    rows: TOKEN_NAMES.map((name) => {
      const definition = TOKENS[name];
      return [
        html`<span class="table__mono">${name}</span>`,
        html`<span class="table__mono"
          >${isAlias(definition) ? `→ ${definition.aliasOf}` : tokens[name]}</span
        >`,
        definition.comment,
      ];
    }),
  });
}

export function designPage(): string {
  const body = html`<div class="layout layout--with-rail">
    <nav class="rail" aria-label="On this page">
      <p class="rail__heading">On this page</p>
      <ul>
        ${[
          ["type", "Type scale"],
          ["surfaces", "Surfaces"],
          ["shape", "Radius"],
          ["rules", "Borders"],
          ["controls", "Controls"],
          ["keyboard", "Keyboard"],
          ["palette", "Palette"],
        ].map(([id, label]) => html`<li><a class="rail__link" href="#${id}">${label}</a></li>`)}
      </ul>
    </nav>

    <div class="stack">
      <header class="section">
        <p class="section__eyebrow">Design system</p>
        <h1>The pieces a Thursday page is built from</h1>
        <p class="section__note">
          Every colour, radius and border below resolves to a token in
          <code>@trythursday/tokens</code>. This stylesheet contains no colour literals; this page is
          generated from the token table itself.
        </p>
      </header>

      <section class="section" id="type">
        <h2>Type scale</h2>
        <p class="section__note">
          Eight steps quantised to whole pixels at a 16px root. Tight ratios through the UI range
          where crowding matters, opening up in the display range where the job is hierarchy.
        </p>
        <div class="panel">
          <div class="panel__body">${typeSpecimens()}</div>
        </div>
      </section>

      <section class="section" id="surfaces">
        <h2>Surfaces</h2>
        <p class="section__note">
          Three planes, separated by luminance rather than by shadow. Depth is never faked with a
          drop shadow: a panel is one step up because it is a lighter plane and has a hairline.
        </p>
        <div class="surface-demo">
          <div class="surface-demo__step surface-demo__step--base">
            background — the canvas, behind everything
          </div>
          <div class="surface-demo__step surface-demo__step--elevated">
            background-elevated — panels, banners, menus
          </div>
          <div class="surface-demo__step surface-demo__step--surface">
            background-surface — inputs, wells, code, hovered rows
          </div>
        </div>
      </section>

      <section class="section" id="shape">
        <h2>Radius: two, and they are not interchangeable</h2>
        <p class="section__note">
          Square where the hands are, rounded where the structure is. A control that takes the
          container radius reads as a pill and stops looking like a tool.
        </p>
        <div class="grid">
          <div class="shape-demo shape-demo--control">
            radius-control · ${tokens["radius-control"]} · buttons, inputs, chips, tabs
          </div>
          <div class="shape-demo shape-demo--container">
            radius-container · ${tokens["radius-container"]} · panels, cards, wells, dialogs
          </div>
        </div>
        ${table({
          head: ["Token", "Value", "Applies to"],
          rows: SHAPE_TOKENS.map((name) => [
            html`<span class="table__mono">${name}</span>`,
            html`<span class="table__mono">${tokens[name]}</span>`,
            TOKENS[name].comment,
          ]),
        })}
      </section>

      <section class="section" id="rules">
        <h2>Borders: hairline versus accessible</h2>
        <p class="section__note">
          <code>border</code> is chrome. <code>border-strong</code> is the outline of anything whose
          edge is the only thing identifying it as a control, because it clears WCAG 1.4.11's 3:1 on
          all three surfaces and <code>border</code> clears it on none.
        </p>
        <div class="grid">
          <div class="border-demo border-demo--hairline">
            border · ${tokens.border} ·
            ${contrastRatio(tokens.border, tokens.background).toFixed(2)}:1 on canvas<br />
            dividers, panel outlines, table rules, tab rails
          </div>
          <div class="border-demo border-demo--strong">
            border-strong · ${tokens["border-strong"]} ·
            ${contrastRatio(tokens["border-strong"], tokens.background).toFixed(2)}:1 on canvas<br />
            secondary buttons, inputs, chips, keycaps
          </div>
        </div>
        ${callout(
          "warning",
          "The rule that is easy to get wrong",
          html`A secondary button outlined in <code>border</code> looks correct on a dark canvas and
            fails the contrast requirement. If the edge is the control, it is
            <code>border-strong</code>.`,
        )}
      </section>

      <section class="section" id="controls">
        <h2>Controls</h2>
        <p class="section__note">
          Compact: 30px tall, 13px labels, 3px corners. Restrained accent — one accent-filled button
          per view, not one per card.
        </p>
        <div class="grid">
          ${panel({
            title: "buttons",
            aside: badge("radius-control"),
            body: html`<div class="row">
              ${button({ label: "Primary", variant: "primary" })}
              ${button({ label: "Secondary", variant: "secondary" })}
              ${button({ label: "Ghost", variant: "ghost" })}
              ${button({ label: "Destructive", variant: "danger" })}
              ${button({ label: "Disabled", variant: "secondary", disabled: true })}
            </div>`,
          })}
          ${panel({
            title: "inputs",
            aside: badge("border-strong"),
            body: html`${field({
              id: "demo-project",
              label: "Project directory",
              placeholder: "~/repos/thursday",
              hint: "Focus it with Tab to see the focus token.",
            })}`,
          })}
          ${panel({
            title: "status",
            aside: badge("state tokens"),
            body: html`<div class="row">
              ${badge("passed", "success")} ${badge("pending", "warning")}
              ${badge("failed", "error")} ${badge("note", "info")} ${chip("workspace-write")}
              ${chip("opus-5")}
            </div>`,
          })}
          ${panel({
            title: "code",
            aside: badge("code token"),
            body: html`<pre><code>pnpm -r --if-present run build
pnpm --filter @trythursday/website run build</code></pre>`,
          })}
        </div>
      </section>

      <section class="section" id="keyboard">
        <h2>Keyboard</h2>
        <p class="section__note">
          Every interactive element on this site is reachable with ${kbd("Tab")} alone and shows a
          ${tokens.focus} ring from the <code>focus</code> token, offset by 2px so it never sits on
          top of the control's own edge. The tabs below take ${kbd("←")} ${kbd("→")} ${kbd("Home")}
          ${kbd("End")} as a roving-tabindex group, and work as plain buttons with the script
          disabled.
        </p>
        ${tabs("Keyboard behaviour", [
          {
            id: "tab-order",
            label: "Tab order",
            body: html`<p>
              The skip link is the first focusable node in the document: press ${kbd("Tab")} once
              from the top of any page and it appears, jumping past the banner to the content.
              Nothing on the site is focusable that is not operable, and nothing operable is
              unreachable.
            </p>`,
          },
          {
            id: "focus-ring",
            label: "Focus ring",
            body: html`<p>
              One rule, on <code>:focus-visible</code>, using <code>outline</code> rather than
              <code>box-shadow</code> so the ring survives forced-colors mode and never reflows the
              control. It is drawn in <code>focus</code>, the one token measured to clear 3:1 on all
              three surfaces.
            </p>`,
          },
          {
            id: "no-script",
            label: "Without JavaScript",
            body: html`<p>
              The site is static HTML and CSS. The only script is a roving-tabindex enhancement for
              this widget; with it blocked, all three panels render and every tab is still a
              focusable button.
            </p>`,
          },
        ])}
      </section>

      <section class="section" id="palette">
        <h2>Palette</h2>
        <p class="section__note">
          ${TOKEN_NAMES.length} tokens, ${COLOUR_TOKENS.length} of them colour. Ratios are measured
          against the canvas by the token package's own contrast function.
        </p>
        <div class="grid">${join(COLOUR_TOKENS.map(swatch))}</div>
        <div class="panel"><div class="panel__body">${tokenTable()}</div></div>
      </section>
    </div>
  </div>`;

  return renderPage({
    title: "Design system",
    description:
      "The Thursday site's type scale, surfaces, radii, borders and controls, generated from the @trythursday/tokens package.",
    current: "/design/",
    body,
  });
}
