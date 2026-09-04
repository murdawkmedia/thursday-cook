/**
 * A 40-line HTML template layer.
 *
 * The point of it is the escaping default: `html` escapes every interpolated
 * string and only lets pre-marked markup through, so a page cannot inject a
 * stray `<` by accident. Everything else -- components, layout, pages -- is
 * an ordinary typed function returning one of these, which is all the
 * "templating" a static site of this size needs.
 */

/** Markup that has already been escaped or is trusted verbatim. */
export interface Html {
  readonly kind: "html";
  readonly value: string;
}

/** Anything a template may interpolate. */
export type Renderable = Html | string | number | boolean | null | undefined | Renderable[];

/** Mark a string as trusted markup. Only for literals we wrote ourselves. */
export function raw(value: string): Html {
  return { kind: "html", value };
}

function isHtml(value: Renderable): value is Html {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value;
}

/** Escape the five characters that can change the shape of a document. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render(value: Renderable): string {
  if (value === null || value === undefined || value === false || value === true) return "";
  if (Array.isArray(value)) return value.map(render).join("");
  if (isHtml(value)) return value.value;
  return escapeHtml(String(value));
}

/** Tagged template producing escaped-by-default markup. */
export function html(strings: TemplateStringsArray, ...values: Renderable[]): Html {
  let out = strings[0] ?? "";
  for (let index = 0; index < values.length; index += 1) {
    out += render(values[index]) + (strings[index + 1] ?? "");
  }
  return raw(out);
}

/** Join a list of fragments with an optional separator. */
export function join(parts: Renderable[], separator = "\n"): Html {
  return raw(parts.map(render).join(separator));
}

/** Serialise a finished document. */
export function toDocument(body: Html): string {
  return `<!doctype html>\n${body.value}\n`;
}
