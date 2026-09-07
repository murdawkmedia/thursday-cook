/**
 * The component vocabulary, as functions.
 *
 * Each one pairs with a class block in `src/styles/components.css`. Keeping
 * them here rather than inline in the pages means the later content ticket
 * composes a page out of named pieces instead of re-deriving markup -- and in
 * particular cannot accidentally give a button a container radius or outline a
 * control with the hairline `border` token, because the choice was made once,
 * here and in the stylesheet.
 */
import { html, join, raw, type Html, type Renderable } from "./html";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonOptions {
  readonly label: string;
  readonly variant?: ButtonVariant;
  /** Render as a link instead of a button when the action is navigation. */
  readonly href?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  /**
   * Ship the control hidden, for a button whose behaviour only exists once
   * `enhance.ts` has confirmed the browser can perform it. The `hidden`
   * attribute rather than a CSS class, so the control is unreachable by
   * keyboard as well as invisible, and stays hidden if the stylesheet never
   * arrives at all.
   */
  readonly hidden?: boolean;
  /**
   * `data-*` attributes: how the enhancement script finds a control and learns
   * what it operates on. Keys are written verbatim -- they are literals in this
   * source, never user input -- and values are escaped like every other
   * interpolation.
   */
  readonly data?: Readonly<Record<string, string>>;
}

function dataAttributes(data: Readonly<Record<string, string>> | undefined): Html {
  if (data === undefined) return html``;
  return join(
    Object.entries(data).map(([key, value]) => html`data-${raw(key)}="${value}"`),
    " ",
  );
}

export function button(options: ButtonOptions): Html {
  const variant = options.variant ?? "secondary";
  const classes = `btn btn--${variant}`;
  if (options.href !== undefined) {
    return html`<a class="${classes}" href="${options.href}">${options.label}</a>`;
  }
  return html`<button
    class="${classes}"
    type="button"
    ${options.id === undefined ? null : html`id="${options.id}"`}
    ${dataAttributes(options.data)}
    ${options.disabled === true ? html`disabled` : null}
    ${options.hidden === true ? html`hidden` : null}
  >
    ${options.label}
  </button>`;
}

export function chip(label: string): Html {
  return html`<span class="chip">${label}</span>`;
}

export type BadgeTone = "neutral" | "success" | "warning" | "error" | "info";

export function badge(label: string, tone: BadgeTone = "neutral"): Html {
  const modifier = tone === "neutral" ? "" : ` badge--${tone}`;
  return html`<span class="badge${modifier}">${label}</span>`;
}

export function kbd(key: string): Html {
  return html`<kbd>${key}</kbd>`;
}

export interface PanelOptions {
  readonly title: string;
  readonly aside?: Renderable;
  readonly body: Renderable;
}

export function panel(options: PanelOptions): Html {
  return html`<section class="panel">
    <header class="panel__header">
      <h3 class="panel__title">${options.title}</h3>
      ${options.aside ?? null}
    </header>
    <div class="panel__body">${options.body}</div>
  </section>`;
}

export type CalloutTone = "info" | "warning" | "error";

export function callout(tone: CalloutTone, title: string, body: Renderable): Html {
  const modifier = tone === "info" ? "" : ` callout--${tone}`;
  return html`<div class="callout${modifier}">
    <p class="callout__title">${title}</p>
    <div class="callout__body">${body}</div>
  </div>`;
}

export interface FieldOptions {
  readonly id: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly hint?: string;
}

export function field(options: FieldOptions): Html {
  const hintId = `${options.id}-hint`;
  return html`<p class="field">
    <label class="field__label" for="${options.id}">${options.label}</label>
    <input
      class="field__control"
      id="${options.id}"
      type="text"
      placeholder="${options.placeholder ?? ""}"
      ${options.hint === undefined ? null : html`aria-describedby="${hintId}"`}
    />
    ${
      options.hint === undefined
        ? null
        : html`<span class="field__hint" id="${hintId}">${options.hint}</span>`
    }
  </p>`;
}

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly body: Renderable;
}

/**
 * An ARIA tabs widget that is correct with JavaScript switched off: every
 * panel is rendered, the first is shown, and `enhance.ts` only adds the
 * roving-tabindex behaviour on top. Without the script the tabs are still
 * reachable buttons and the first panel is still readable.
 */
export function tabs(name: string, items: TabItem[]): Html {
  const buttons = items.map(
    (item, index) =>
      html`<button
        class="tab"
        type="button"
        role="tab"
        id="${name}-tab-${item.id}"
        aria-controls="${name}-panel-${item.id}"
        aria-selected="${index === 0 ? "true" : "false"}"
        tabindex="${index === 0 ? "0" : "-1"}"
      >
        ${item.label}
      </button>`,
  );
  const panels = items.map(
    (item, index) =>
      html`<div
        class="tabs__panel"
        role="tabpanel"
        id="${name}-panel-${item.id}"
        aria-labelledby="${name}-tab-${item.id}"
        tabindex="0"
        ${index === 0 ? null : html`hidden`}
      >
        ${item.body}
      </div>`,
  );
  return html`<div class="tabs" data-tabs>
    <div class="tabs__list" role="tablist" aria-label="${name}">${join(buttons)}</div>
    ${join(panels)}
  </div>`;
}

export interface TableOptions {
  readonly caption?: string;
  readonly head: string[];
  readonly rows: Renderable[][];
}

export function table(options: TableOptions): Html {
  return html`<table class="table">
    ${
      options.caption === undefined
        ? null
        : html`<caption class="section__note">
            ${options.caption}
          </caption>`
    }
    <thead>
      <tr>
        ${options.head.map((cell) => html`<th scope="col">${cell}</th>`)}
      </tr>
    </thead>
    <tbody>
      ${options.rows.map(
        (row) =>
          html`<tr>
            ${row.map((cell) => html`<td>${cell}</td>`)}
          </tr>`,
      )}
    </tbody>
  </table>`;
}

/** A labelled slot the content ticket fills in. Structure without copy. */
export function slot(label: string, brief: string): Html {
  return html`<div class="slot">
    <p class="slot__label">${label}</p>
    <p class="slot__brief">${brief}</p>
  </div>`;
}

/**
 * The attribute `enhance.ts` looks for to attach copy-to-clipboard behaviour.
 *
 * Exported because it is a contract between two files that are built
 * separately -- the generator and the browser script -- and a contract with
 * one end renamed is a silently dead button. `tests/landing.test.ts` asserts
 * both ends still agree.
 */
export const COPY_ATTRIBUTE = "copy";

export interface CommandOptions {
  /** Id given to the element holding the text, so the copy button can find it. */
  readonly id: string;
  /** The command itself, verbatim. One line: a reader copies one line. */
  readonly command: string;
  /** Label for the copy control before it has been used. */
  readonly copyLabel?: string;
  /** Label the control shows after a successful copy. */
  readonly copiedLabel?: string;
}

/**
 * A copyable one-line command.
 *
 * PROGRESSIVE ENHANCEMENT, AND WHAT IT DEGRADES TO. The command is ordinary
 * selectable text inside a `<pre>`, which is the whole feature for a reader
 * with no JavaScript: select, copy, paste. The button ships with the `hidden`
 * attribute set and is unhidden only by `enhance.ts`, and only once it has
 * seen a usable clipboard API -- so a reader is never offered a control that
 * cannot work, and never tabs into an invisible one.
 */
export function command(options: CommandOptions): Html {
  const statusId = `${options.id}-status`;
  return html`<div class="command">
    <pre class="command__code"><code id="${options.id}">${options.command}</code></pre>
    ${button({
      label: options.copyLabel ?? "Copy",
      variant: "secondary",
      hidden: true,
      data: {
        [COPY_ATTRIBUTE]: options.id,
        "copy-status": statusId,
        "copy-done": options.copiedLabel ?? "Copied",
      },
    })}
    <p class="visually-hidden" id="${statusId}" role="status" aria-live="polite"></p>
  </div>`;
}

export interface StatOptions {
  /** The measured value, or the placeholder text when nothing is measured. */
  readonly value: string;
  /** True when `value` is the placeholder, so the cell can announce itself. */
  readonly unmeasured?: boolean;
  readonly label: string;
  readonly note: string;
  /** The command or query that regenerates the value. */
  readonly source: string;
}

/**
 * One measured number, carrying the thing that produced it.
 *
 * The source line is not decoration. A statistic on a marketing page is
 * unfalsifiable unless the reader is told how to reproduce it, and this page
 * argues that unfalsifiable claims are the problem.
 */
export function stat(options: StatOptions): Html {
  return html`<div class="stat">
    <p class="stat__value${options.unmeasured === true ? " stat__value--unmeasured" : ""}">
      ${options.value}
    </p>
    <p class="stat__label">${options.label}</p>
    <p class="stat__note">${options.note}</p>
    <p class="stat__source"><code>${options.source}</code></p>
  </div>`;
}

export interface FlowStage {
  readonly label: string;
  readonly body: string;
}

/**
 * An ordered strip of stages, for a sequence whose order is the point.
 *
 * An `<ol>` rather than a row of boxes, because the order is semantic: a
 * screen reader should hear "3 of 3", and the arrows between the stages are
 * decoration added in CSS rather than characters in the accessible name.
 */
export function flow(stages: readonly FlowStage[]): Html {
  return html`<ol class="flow">
    ${join(
      stages.map(
        (stage) =>
          html`<li class="flow__stage">
            <span class="flow__label">${stage.label}</span>
            <span class="flow__body">${stage.body}</span>
          </li>`,
      ),
    )}
  </ol>`;
}
