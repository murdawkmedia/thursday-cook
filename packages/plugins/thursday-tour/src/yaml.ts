/**
 * A strict-subset YAML reader, exactly as big as `data/steps.yaml` needs.
 *
 * It is NOT a general YAML parser, and it must never become one: anything
 * outside the subset below is a thrown `YamlSubsetError` naming the line,
 * so a hand edit that reaches for anchors, flow syntax or clever scalars
 * fails loudly at generation and test time instead of parsing surprisingly.
 *
 * SUPPORTED:
 * - top-level mapping of `tickets` (sequence of scalars) and `steps`
 *   (sequence of mappings); mappings nested one level for `done`
 * - sequences: `- item`, `- key: value` (inline map start), `- |` blocks
 * - values: plain single-line scalars, single/double-quoted scalars,
 *   `|` literal and `>` folded block scalars (with optional `-` chomping),
 *   integers (for `chapter`), `~`/`null`/empty for null
 * - full-line `#` comments, blank lines, and trailing ` #` comments
 *
 * REJECTED: tabs, flow `[]`/`{}`, anchors/aliases/tags, multi-line plain
 * scalars (use a block), duplicate keys, mixed map/sequence items at one
 * level, inconsistent indentation, unquoted values starting with a
 * structural character.
 */

/** A subset-YAML value: scalars, sequences and string-keyed mappings. */
export type YamlValue = string | number | null | YamlValue[] | { [key: string]: YamlValue };

/** Thrown with the offending 1-based line number. */
export class YamlSubsetError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(`YAML subset error at line ${line}: ${message}`);
    this.name = "YamlSubsetError";
    this.line = line;
  }
}

interface Line {
  readonly text: string;
  readonly indent: number;
  readonly line: number;
}

function splitLines(text: string): Line[] {
  return text.split("\n").map((raw, index) => {
    const line = index + 1;
    const stripped = raw.replace(/\r$/, "");
    if (stripped.includes("\t")) throw new YamlSubsetError("tabs are not indentation", line);
    const indent = stripped.length - stripped.trimStart().length;
    return { text: stripped, indent, line };
  });
}

/** Drop blanks and full-line comments, keeping original line numbers. */
function significant(lines: Line[]): Line[] {
  return lines.filter((entry) => {
    const trimmed = entry.text.trim();
    return trimmed !== "" && !trimmed.startsWith("#");
  });
}

/**
 * Strip a trailing ` # comment` from a plain scalar, honouring quotes.
 * A `#` directly inside a word (`draft-ideas#2`) is content, not a comment.
 */
function stripTrailingComment(scalar: string, line: number): string {
  let quote: string | null = null;
  for (let i = 0; i < scalar.length; i++) {
    const char = scalar[i] as string;
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && i > 0 && scalar[i - 1] === " ") {
      return scalar.slice(0, i).trimEnd();
    }
  }
  if (quote !== null) throw new YamlSubsetError("unterminated quote", line);
  return scalar;
}

function unquote(scalar: string, line: number): string {
  const quote = scalar[0] as string;
  const inner = scalar.slice(1, -1);
  if (quote === "'") {
    if (inner.includes("'") && !/^([^']|'')*$/.test(inner)) {
      throw new YamlSubsetError("bad single-quote escape (only '' is allowed)", line);
    }
    return inner.replace(/''/g, "'");
  }
  return inner.replace(/\\(\\|"|n|t)/g, (match, code: string) => {
    if (code === "n") return "\n";
    if (code === "t") return "\t";
    return code;
  });
}

/** One scalar on one line: quoted, null, integer, or a plain string. */
function parseScalar(raw: string, line: number): string | number | null {
  const text = stripTrailingComment(raw.trim(), line);
  if (text === "" || text === "~" || text === "null") return null;
  const first = text[0] as string;
  const last = text[text.length - 1] as string;
  if (first === '"' || first === "'") {
    if (text.length < 2 || last !== first) {
      throw new YamlSubsetError("unterminated quote", line);
    }
    return unquote(text, line);
  }
  if ("[{&*!|>%@`".includes(first)) {
    throw new YamlSubsetError(
      `value starts with "${first}" -- quote it if that is really the text`,
      line,
    );
  }
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  // Like YAML itself, plain scalars cannot carry `: ` (colon-then-space):
  // `key: Run this: now` never means what it looks like. Quote it.
  if (text.includes(": ")) {
    throw new YamlSubsetError("ambiguous ':' in a plain scalar -- quote the value", line);
  }
  return text;
}

interface Block {
  readonly value: YamlValue;
  readonly next: number;
}

/** Parse the mapping or sequence starting at `at` (which shares one indent). */
function parseBlock(lines: Line[], at: number, indent: number): Block {
  const first = (lines[at] as Line).text.trimStart();
  if (first.startsWith("- ") || first === "-") return parseSequence(lines, at, indent);
  return parseMapping(lines, at, indent);
}

function parseMapping(lines: Line[], at: number, indent: number): Block {
  const out: { [key: string]: YamlValue } = {};
  let i = at;
  while (i < lines.length) {
    const entry = lines[i] as Line;
    if (entry.indent < indent) break;
    if (entry.indent > indent) {
      throw new YamlSubsetError("unexpected indentation", entry.line);
    }
    const text = entry.text.trimStart();
    if (text.startsWith("- ") || text === "-") {
      throw new YamlSubsetError("sequence item inside a mapping", entry.line);
    }
    const colon = text.indexOf(":");
    if (colon < 0) throw new YamlSubsetError("expected `key: value`", entry.line);
    const key = text.slice(0, colon).trim();
    if (key === "" || /\s/.test(key)) throw new YamlSubsetError("bad mapping key", entry.line);
    if (key in out) throw new YamlSubsetError(`duplicate key "${key}"`, entry.line);
    const rest = text.slice(colon + 1).trim();
    if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
      const block = readBlockScalar(lines, i + 1, indent, rest[0] as string);
      out[key] = block.value;
      i = block.next;
    } else if (rest !== "" && !rest.startsWith("#")) {
      // A trailing `# comment` inside the scalar is stripped by
      // parseScalar; a comment standing alone means empty, like YAML.
      out[key] = parseScalar(rest, entry.line);
      i += 1;
    } else {
      const peek = lines[i + 1];
      if (peek !== undefined && peek.indent > indent) {
        const nested = parseBlock(lines, i + 1, peek.indent);
        out[key] = nested.value;
        i = nested.next;
      } else {
        out[key] = null;
        i += 1;
      }
    }
  }
  return { value: out, next: i };
}

/** Merge the deeper-indented mapping pairs following a `- key: ...` item. */
function mergeFollowingPairs(
  lines: Line[],
  i: number,
  indent: number,
  item: { [key: string]: YamlValue },
  entryLine: number,
): number {
  const following = lines[i + 1];
  if (following === undefined || following.indent <= indent) return i + 1;
  const nested = parseMapping(lines, i + 1, following.indent);
  if (typeof nested.value !== "object" || nested.value === null || Array.isArray(nested.value)) {
    throw new YamlSubsetError("expected mapping pairs after a sequence item", entryLine);
  }
  for (const [key, value] of Object.entries(nested.value)) {
    if (key in item) throw new YamlSubsetError(`duplicate key "${key}"`, entryLine);
    item[key] = value;
  }
  return nested.next;
}

function parseSequence(lines: Line[], at: number, indent: number): Block {
  const out: YamlValue[] = [];
  let i = at;
  while (i < lines.length) {
    const entry = lines[i] as Line;
    if (entry.indent < indent) break;
    if (entry.indent > indent) {
      throw new YamlSubsetError("unexpected indentation", entry.line);
    }
    const text = entry.text.trimStart();
    if (!text.startsWith("- ") && text !== "-") break;
    const rest = text === "-" ? "" : text.slice(2).trim();
    if (rest === "") {
      const peek = lines[i + 1];
      if (peek === undefined || peek.indent <= indent) {
        throw new YamlSubsetError("empty sequence item", entry.line);
      }
      const nested = parseBlock(lines, i + 1, peek.indent);
      out.push(nested.value);
      i = nested.next;
    } else if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
      const block = readBlockScalar(lines, i + 1, indent, rest[0] as string);
      out.push(block.value);
      i = block.next;
    } else {
      // `- key: value` starts a mapping whose remaining pairs sit deeper.
      // A bare scalar carrying `: ` is rejected by parseScalar, so reaching
      // for a colon here always means a mapping -- same as YAML itself.
      const colon = rest.indexOf(":");
      const head = colon < 0 ? "" : rest.slice(0, colon);
      if (colon >= 0 && /^[A-Za-z0-9_-]+$/.test(head)) {
        const rawValue = rest.slice(colon + 1).trim();
        // A comment standing alone where the value goes means empty.
        const valueText = rawValue.startsWith("#") ? "" : rawValue;
        const item: { [key: string]: YamlValue } = {};
        if (valueText === "|" || valueText === ">" || valueText === "|-" || valueText === ">-") {
          const block = readBlockScalar(lines, i + 1, indent, valueText[0] as string);
          item[head] = block.value;
          // The block already consumed through block.next - 1; pairs follow.
          i = mergeFollowingPairs(lines, block.next - 1, indent, item, entry.line);
        } else {
          item[head] = valueText === "" ? null : parseScalar(valueText, entry.line);
          i = mergeFollowingPairs(lines, i, indent, item, entry.line);
        }
        out.push(item);
      } else {
        if (rest.startsWith("#"))
          throw new YamlSubsetError("comment-only sequence item", entry.line);
        out.push(parseScalar(rest, entry.line));
        i += 1;
      }
    }
  }
  return { value: out, next: i };
}

/** Consume the indented lines of a `|`/`>` block scalar. */
function readBlockScalar(lines: Line[], at: number, parentIndent: number, style: string): Block {
  const taken: { text: string; line: number }[] = [];
  let i = at;
  while (i < lines.length && (lines[i] as Line).indent > parentIndent) {
    taken.push({ text: (lines[i] as Line).text, line: (lines[i] as Line).line });
    i += 1;
  }
  if (taken.length === 0)
    throw new YamlSubsetError("empty block scalar", (lines[at - 1] as Line).line);
  const base = Math.min(...taken.map((entry) => entry.text.length - entry.text.trimStart().length));
  if (base <= parentIndent)
    throw new YamlSubsetError("block scalar is not indented past its key", taken[0]?.line ?? 1);
  const content = taken.map((entry) => entry.text.slice(base));
  if (style === "|") return { value: content.join("\n").trimEnd(), next: i };
  // `>`: folded -- blank-line-separated paragraphs, single breaks fold away.
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const lineText of content) {
    if (lineText.trim() === "") {
      if (current.length > 0) {
        paragraphs.push(current.join(" "));
        current = [];
      }
      paragraphs.push("");
    } else {
      current.push(lineText.trim());
    }
  }
  if (current.length > 0) paragraphs.push(current.join(" "));
  while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1] === "") paragraphs.pop();
  return { value: paragraphs.join("\n"), next: i };
}

/** Parse a whole document: it must be a top-level mapping. */
export function parseSubsetYaml(text: string): { [key: string]: YamlValue } {
  const lines = significant(splitLines(text));
  if (lines.length === 0) throw new YamlSubsetError("empty document", 1);
  const first = lines[0] as Line;
  if (first.text.trimStart().startsWith("- ") || first.text.trimStart() === "-") {
    throw new YamlSubsetError("top level must be a mapping", first.line);
  }
  const block = parseMapping(lines, 0, first.indent);
  if (block.next !== lines.length) {
    throw new YamlSubsetError("unexpected indentation", (lines[block.next] as Line).line);
  }
  return block.value as { [key: string]: YamlValue };
}
