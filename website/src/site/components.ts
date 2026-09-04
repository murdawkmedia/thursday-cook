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
import { html, join, type Html, type Renderable } from "./html";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonOptions {
  readonly label: string;
  readonly variant?: ButtonVariant;
  /** Render as a link instead of a button when the action is navigation. */
  readonly href?: string;
  readonly disabled?: boolean;
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
    ${options.disabled === true ? html`disabled` : null}
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
