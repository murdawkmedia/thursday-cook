/**
 * Rebuild tests/fixtures/published-lists.json from the published loading-message
 * collections TH3's originality criterion is checked against.
 *
 *   node scripts/refresh-published-lists.mjs
 *
 * The fixture is CHECKED IN rather than fetched at test time, so the suite
 * stays offline and deterministic and the corpus is reviewable in a diff. The
 * price is that it ages, and this script is how it stops ageing. Run it when
 * adding a phrase, and read the diff: a corpus that suddenly grew by 200
 * messages is a list that changed under us, and the phrase set should be
 * re-checked against it before anything ships.
 *
 * Three sources, chosen because they are the ones this ecosystem actually
 * copies from rather than the ones that rank well:
 *
 *   - meain's gist, the SimCity-2000-descended list that most "funny loading
 *     messages" posts are downstream of;
 *   - loadr, which ships 202 messages in its README;
 *   - happy-load, which publishes a JSON artifact.
 *
 * If a fetch fails the script exits non-zero and writes nothing. A partial
 * corpus would silently weaken every assertion in tests/originality.test.ts,
 * which is the one failure mode worth being loud about.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "tests", "fixtures", "published-lists.json");

const SOURCES = [
  {
    id: "meain-gist",
    url: "https://gist.github.com/meain/6440b706a97d2dd71574769517e7ed32",
    raw: "https://gist.githubusercontent.com/meain/6440b706a97d2dd71574769517e7ed32/raw",
    // A JS array of double-quoted strings.
    extract: (text) => [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]),
  },
  {
    id: "loadr",
    url: "https://github.com/dimitarchristoff/loadr",
    raw: "https://raw.githubusercontent.com/dimitarchristoff/loadr/master/README.md",
    // A markdown blockquoted bullet list.
    extract: (text) => [...text.matchAll(/^>?\s*-\s+(.+?)\s*$/gm)].map((match) => match[1]),
  },
  {
    id: "happy-load",
    url: "https://github.com/pagedip/happy-load",
    raw: "https://unpkg.com/happy-load/happy-load.json",
    extract: (text) => {
      const found = [];
      const walk = (value) => {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === "object") {
          if (typeof value.text === "string") found.push(value.text);
          Object.values(value).forEach(walk);
        }
      };
      walk(JSON.parse(text));
      return found;
    },
  },
];

const messages = [];
const seen = new Set();

for (const source of SOURCES) {
  const response = await fetch(source.raw);
  if (!response.ok) {
    console.error(source.id + ": " + response.status + " from " + source.raw);
    process.exit(1);
  }
  const extracted = source.extract(await response.text()).filter((t) => t && t.length > 2);
  if (extracted.length === 0) {
    console.error(source.id + ": extracted nothing; the source's shape has changed.");
    process.exit(1);
  }
  for (const text of extracted) {
    const key = source.id + "|" + text;
    if (seen.has(key)) continue;
    seen.add(key);
    messages.push({ src: source.id, text });
  }
  console.log(source.id + ": " + extracted.length + " messages");
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      sources: SOURCES.map(({ id, url }) => ({ id, url })),
      messages,
    },
    null,
    2,
  ) + "\n",
);

console.log("wrote " + messages.length + " messages to " + OUT);
