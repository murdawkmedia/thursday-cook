/**
 * Behavioural tests for the landing page.
 *
 * WHAT THESE DO NOT DO. They do not assert that a sentence is present. A test
 * that greps for copy passes for as long as nobody edits the copy and tells
 * you nothing about whether the page is honest or correct. Every test below
 * derives its expectation from something outside the page -- the README on
 * disk, the release flag, the rendered document's own structure -- so that the
 * thing under test can actually be wrong.
 *
 * The three properties worth protecting, in order of how expensive they are to
 * get wrong:
 *   1. The page cannot print an install command that nobody can run, and
 *      cannot print an unmeasured number as though it were measured.
 *   2. The four goals cannot drift away from the README that owns them.
 *   3. The "coming soon" section cannot start describing itself in a tense
 *      that implies any of it exists.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COPY_ATTRIBUTE } from "../src/site/components";
import { escapeHtml } from "../src/site/html";
import {
  CLAIMS,
  COMING_SOON,
  FRUSTRATIONS,
  INSTALL_COMMAND_ID,
  BOARD_SURFACE,
  capitalise,
  countWord,
  indexPage,
} from "../src/site/pages/index";
import {
  DOGFOOD_STATS,
  INSTALL_COMMAND,
  INSTALL_LIVE,
  INSTALL_REQUIREMENTS,
  RELEASE,
  STAT_PLACEHOLDER,
  releaseBlockers,
  type DogfoodStat,
} from "../src/site/release";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageDir, "..");

/** The page exactly as it ships today. */
const shipped = indexPage();

/** The page as it would be the moment the install flag is flipped. */
const live = indexPage({ installLive: true, stats: DOGFOOD_STATS });

/** Text content, with tags removed, for tests about prose rather than markup. */
function textOf(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

/**
 * A body's prose, lowercased with runs of whitespace collapsed.
 *
 * Source is wrapped at 100 columns, so a two-word phrase can be split across a
 * line break. Matching the raw template literal therefore tests the formatter,
 * not the writing.
 */
function prose(body: { readonly value: string } | undefined): string {
  return textOf(body?.value ?? "").toLowerCase();
}

/**
 * The markup between two unique ordered landmarks.
 *
 * Slicing on landmarks rather than on `</section>` because panels are
 * themselves `<section>` elements, so counting close tags would end the slice
 * in the wrong place.
 */
function markupBetween(markup: string, from: string, to: string): string {
  const start = markup.indexOf(from);
  const end = markup.indexOf(to, start + from.length);
  expect(start, `landmark not found: ${from}`).toBeGreaterThan(-1);
  expect(end, `landmark not found after ${from}: ${to}`).toBeGreaterThan(start);
  return markup.slice(start, end);
}

describe("the four goals are canonical, character for character", () => {
  /**
   * The canonical goals, from `docs/voice.md` section 7: the bold sentences of
   * its numbered list. voice.md is the source README and this page both
   * reproduce, and neither may edit its copy alone -- so the test reads
   * voice.md, not either copy. Parsed from the file rather than copied here,
   * so this test fails when either side moves.
   */
  function canonicalGoals(): string[] {
    const voice = readFileSync(join(repoRoot, "docs", "voice.md"), "utf8");
    const heading = "## 7. The four goals";
    const start = voice.indexOf(heading);
    expect(start, "voice.md has no '## 7. The four goals' section").toBeGreaterThan(-1);
    const rest = voice.slice(start + heading.length);
    const end = rest.indexOf("\n## ");
    const section = end === -1 ? rest : rest.slice(0, end);
    return [...section.matchAll(/^\d+\. \*\*(.+?)\*\*$/gm)].map((match) => match[1] ?? "");
  }

  it("finds exactly four goals in voice.md section 7", () => {
    expect(canonicalGoals()).toHaveLength(4);
  });

  /**
   * The README is the other reproducing surface. It is parsed with its own
   * extractor -- the goals sit under "## What it is for" as bold lead
   * sentences, not in a numbered list -- and held to the canonical set, so a
   * README edit alone fails exactly as a page edit alone does.
   */
  function readmeGoals(): string[] {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    const heading = "## What it is for";
    const start = readme.indexOf(heading);
    expect(start, "README has no '## What it is for' section").toBeGreaterThan(-1);
    const rest = readme.slice(start + heading.length);
    const end = rest.indexOf("\n## ");
    const section = end === -1 ? rest : rest.slice(0, end);
    return [...section.matchAll(/\*\*(.+?)\*\*/g)].map((match) => match[1] ?? "");
  }

  it("reproduces the canonical goals in the README, word for word", () => {
    expect(readmeGoals()).toEqual(canonicalGoals());
  });

  it("states them in the canonical words and the canonical order", () => {
    const onPage = CLAIMS.filter((claim) => claim.canonical).map((claim) => claim.claim);
    expect(onPage).toEqual(canonicalGoals());
  });

  it("renders each one into the document", () => {
    for (const goal of canonicalGoals()) {
      expect(shipped, `goal missing from the page: ${goal}`).toContain(escapeHtml(goal));
    }
  });

  it("is grounded: each goal's body names the mechanism voice.md section 7 lists for it", () => {
    // The grounding table in voice.md §7 is what stops the headings from
    // claiming capabilities that do not exist. Each body must name its row's
    // mechanism, or the heading is a claim the page cannot support.
    const grounded: Readonly<Record<string, string[]>> = {
      "A wrong tool call is rewritten, not refused.": ["guard", "translat"],
      "Delegated work returns a result, not the exploration that produced it.": [
        "brief",
        "context of its own",
      ],
      "The plan is written and edited before it becomes tickets.": [
        "imports to an aidos board",
        "acceptance criteria",
        "files it may write",
      ],
      "The agent cannot sign off a ticket, and it cannot mark one done.": [
        "human evidence kinds",
        "tool set",
        "allowlist",
      ],
    };
    for (const claim of CLAIMS.filter((entry) => entry.canonical)) {
      const body = prose(claim.body);
      for (const term of grounded[claim.claim] ?? []) {
        expect(body, `${claim.claim} does not name its grounding: ${term}`).toContain(term);
      }
    }
  });
});

describe("every claim names the mechanism that delivers it", () => {
  it("makes exactly five claims", () => {
    expect(CLAIMS).toHaveLength(5);
  });

  it.each(CLAIMS.map((claim) => [claim.claim, claim] as const))(
    "%s names a mechanism that reaches the page",
    (_label, claim) => {
      expect(claim.mechanism.trim()).not.toBe("");
      expect(shipped).toContain(escapeHtml(claim.mechanism));
    },
  );

  it.each(CLAIMS.map((claim) => [claim.claim, claim] as const))(
    "%s is explained by a mechanism rather than by itself",
    (_label, claim) => {
      // A mechanism that only repeats its claim's words is the claim said
      // twice. It must name something the claim does not: share a noun with
      // the claim if it likes, but add at least one content word the claim
      // lacks, and never appear as a substring of the claim.
      const STOP = new Set(["the", "a", "an", "of", "to", "is", "and", "it", "its", "not", "one"]);
      const words = (value: string): string[] =>
        value
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((word) => word !== "" && !STOP.has(word));
      const mechanism = words(claim.mechanism);
      const statement = claim.claim.toLowerCase();
      expect(
        mechanism.length,
        `mechanism has no content words: ${claim.mechanism}`,
      ).toBeGreaterThan(0);
      expect(statement.includes(claim.mechanism.toLowerCase())).toBe(false);
      expect(
        mechanism.some((word) => !statement.includes(word)),
        `mechanism adds nothing the claim does not say: ${claim.mechanism}`,
      ).toBe(true);
    },
  );

  it.each(CLAIMS.map((claim) => [claim.claim, claim] as const))(
    "%s is backed by prose that points at something in the system",
    (_label, claim) => {
      // The vocabulary of things a reader could go and look at. A body that
      // names none of them is describing a benefit, not a mechanism.
      const concrete = [
        "guard",
        "allowlist",
        "acceptance criteria",
        "ticket",
        "board",
        "gate",
        "evidence",
        "brief",
        "context window",
        "session",
        "tool set",
        "signoff",
        "plan",
      ];
      const body = prose(claim.body);
      const named = concrete.filter((term) => body.includes(term));
      expect(named.length, `no mechanism named in the body of: ${claim.claim}`).toBeGreaterThan(0);
    },
  );
});

describe("the frustrations the page names", () => {
  it("counts its own panels in its heading, rather than storing the number twice", () => {
    expect(textOf(shipped)).toContain(
      `${capitalise(countWord(FRUSTRATIONS.length))} failures, and the mechanism that prevents each`,
    );
  });

  it.each(FRUSTRATIONS.map((entry) => [entry.symptom, entry] as const))(
    "%s names a mechanism that reaches the page",
    (_label, entry) => {
      expect(entry.mechanism.trim()).not.toBe("");
      expect(shipped).toContain(escapeHtml(entry.symptom));
      expect(shipped).toContain(escapeHtml(entry.mechanism));
    },
  );

  it("states what the user does and what the system does, not that the model remembers", () => {
    const aside = FRUSTRATIONS.find((entry) => entry.mechanism.includes("tickets it"));
    expect(aside, "the dropped-aside frustration is missing").toBeDefined();
    const body = prose(aside?.body);
    // The mechanism is where the list lives. A body that only promises the ask
    // will be remembered has restated the claim instead of explaining it.
    for (const term of ["files it as a ticket", "continues", "persists across sessions"]) {
      expect(body, `the dropped-aside body does not name: ${term}`).toContain(term);
    }
  });

  /*
   * The owner's own shorthand for this frustration was a clinical one. It must
   * not reach the public page: it invites an argument the page does not want,
   * and it locates the fault in the model's attention when the whole point is
   * that the list was never in the model's head. This test is the guard, and
   * it covers both render states.
   */
  it.each([
    "adhd",
    "attention deficit",
    "neurodivergent",
    "neurodiverse",
    "disorder",
    "diagnos",
    "forgetful",
    "goldfish",
  ])("never reaches for %s to describe it", (term) => {
    expect(textOf(shipped).toLowerCase()).not.toContain(term);
    expect(textOf(live).toLowerCase()).not.toContain(term);
  });
});

describe("the board as an input surface", () => {
  it("stays subordinate to the thesis: the hero still leads, this section follows the symptoms", () => {
    const heroAt = shipped.indexOf('aria-labelledby="lede"');
    const frustrationsAt = shipped.indexOf('aria-labelledby="frustrations"');
    const boardAt = shipped.indexOf('aria-labelledby="board"');
    const goalsAt = shipped.indexOf('aria-labelledby="goals"');
    expect(boardAt).toBeGreaterThan(-1);
    expect([heroAt, frustrationsAt, boardAt, goalsAt]).toEqual(
      [heroAt, frustrationsAt, boardAt, goalsAt].sort((a, b) => a - b),
    );
  });

  it.each(BOARD_SURFACE.map((entry) => [entry.title, entry] as const))(
    "%s names a mechanism that reaches the page",
    (_label, entry) => {
      expect(entry.mechanism.trim()).not.toBe("");
      expect(shipped).toContain(escapeHtml(entry.title));
      expect(shipped).toContain(escapeHtml(entry.mechanism));
    },
  );

  it("explains the async board by how a comment is delivered, not by promising it is noticed", () => {
    const board = BOARD_SURFACE.find((entry) => entry.mechanism.includes("steer"));
    expect(board, "the async board panel is missing").toBeDefined();
    const body = prose(board?.body);
    // The mechanism verified in aidos/src/host/aidos-core.ts: steer, which
    // starts a turn for an idle agent and rides the next step boundary for a
    // running one. "It will see it eventually" would be a restatement.
    for (const term of ["steering digest", "idle agent", "step boundary", "quoted block"]) {
      expect(body, `the async board body does not name: ${term}`).toContain(term);
    }
    // And it must rule out the mechanism a reader would otherwise assume.
    expect(body).toContain("polling");
  });

  /*
   * The input-surface half of the claim: the user works in the board directly.
   * Stated as actions, per the copy standard -- what the user does, then what
   * the system does in response.
   */
  it("states what the user does on the board, as actions", () => {
    const board = BOARD_SURFACE.find((entry) => entry.mechanism.includes("steer"));
    const body = prose(board?.body);
    for (const action of ["open the board", "reorder the tickets", "write a comment"]) {
      expect(body, `the input-surface claim omits the user action: ${action}`).toContain(action);
    }
    // And the return path, which is the system's response.
    expect(body).toContain("delivers board changes to the agent as a steering digest");
  });

  it("explains granularity as a bounded view with an expansion path, not as a summary", () => {
    const views = BOARD_SURFACE.find((entry) => entry.mechanism.includes("granularity"));
    expect(views, "the granularity panel is missing").toBeDefined();
    const body = prose(views?.body);
    for (const term of ["bounded projection", "truncated", "granularity you choose"]) {
      expect(body, `the granularity body does not name: ${term}`).toContain(term);
    }
    // The load-bearing half of the claim: the detail still exists.
    expect(body).toContain("nothing is discarded");
  });

  /*
   * `thursday session` is built and tested but NOT merged. The general
   * granularity claim is shippable because the board digest and the board
   * views are live; the session-log numbers are not, and must not leak into
   * page copy as though a reader could run the command today.
   */
  it("makes no page-copy claim about a tool that is not in the repository", () => {
    // Slice to the NEXT section's landmark, not to "</section>": panel() is
    // itself a <section>, so closing-tag slicing stops inside the first panel
    // and silently stops testing the rest. A mutation proved that.
    const prose = textOf(
      markupBetween(shipped, 'aria-labelledby="board"', 'aria-labelledby="goals"'),
    );
    for (const term of ["thursday session", "recall ", "session log"]) {
      expect(prose.toLowerCase(), `board copy reaches for: ${term}`).not.toContain(term);
    }
  });
});

describe("the plan to tickets to background execution flow", () => {
  /** The flow strip's stage labels, in document order. */
  function stageLabels(markup: string): string[] {
    return [...markup.matchAll(/<span class="flow__label">([^<]*)<\/span>/g)].map((match) =>
      (match[1] ?? "").trim(),
    );
  }

  it("shows three ordered stages", () => {
    const labels = stageLabels(shipped);
    expect(labels).toHaveLength(3);
  });

  it("shows plan, then tickets, then background execution, in that order", () => {
    const labels = stageLabels(shipped).map((label) => label.toLowerCase());
    const positions = ["plan", "tickets", "background execution"].map((stage) =>
      labels.findIndex((label) => label.includes(stage)),
    );
    expect(
      positions.every((position) => position > -1),
      `stages found: ${labels.join(", ")}`,
    ).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("marks the stages up as an ordered list, so the order is announced too", () => {
    expect(shipped).toContain('<ol class="flow">');
  });

  it("keeps the column that says what the agent cannot do at each step", () => {
    expect(shipped).toContain("What the agent cannot do here");
  });
});

describe("the install call to action", () => {
  it("prints no command while the installer is not served", () => {
    expect(INSTALL_LIVE).toBe(false);
    expect(shipped).not.toContain(INSTALL_COMMAND);
    expect(shipped).toContain("Pre-alpha. Nothing installs yet.");
  });

  it("offers no copy control while there is nothing to copy", () => {
    expect(shipped).not.toContain(`data-${COPY_ATTRIBUTE}=`);
  });

  it("prints the command once the flag is flipped", () => {
    expect(live).toContain(escapeHtml(INSTALL_COMMAND));
    expect(live).not.toContain("Pre-alpha. Nothing installs yet.");
  });

  it("puts the command above the fold, before any section heading", () => {
    const commandAt = live.indexOf(escapeHtml(INSTALL_COMMAND));
    const firstHeadingAt = live.indexOf("<h2");
    expect(commandAt).toBeGreaterThan(-1);
    expect(commandAt).toBeLessThan(firstHeadingAt);
  });

  it("carries the requirements, taken from what install.sh actually refuses on", () => {
    for (const requirement of INSTALL_REQUIREMENTS) {
      expect(live).toContain(escapeHtml(requirement));
    }
  });

  it("is selectable text with no JavaScript, inside a pre", () => {
    const block = markupBetween(live, '<div class="command">', "</div>");
    expect(block).toContain("<pre");
    expect(block).toContain(`<code id="${INSTALL_COMMAND_ID}">`);
    expect(block).toContain(escapeHtml(INSTALL_COMMAND));
  });

  it("ships the copy control hidden, so it is invisible and untabbable without JS", () => {
    const control = markupBetween(
      live,
      `data-${COPY_ATTRIBUTE}="${INSTALL_COMMAND_ID}"`,
      "</button>",
    );
    expect(control).toContain("hidden");
  });

  it("points the copy control at an element that exists in the same document", () => {
    const target = live.match(new RegExp(`data-${COPY_ATTRIBUTE}="([^"]+)"`));
    expect(target).not.toBeNull();
    expect(live).toContain(`id="${target?.[1] ?? ""}"`);
  });
});

describe("the requirements line matches what install.sh actually enforces", () => {
  // The requirements under the command are the first promise this page makes
  // that a reader can check in under a minute, by running it. So they are
  // derived from the installer rather than from anybody's memory of it: every
  // assertion below reads `install/install.sh` and compares against it.
  const installer = readFileSync(join(repoRoot, "install", "install.sh"), "utf8");
  const requirements = INSTALL_REQUIREMENTS.join(" · ");

  it("prints the command the installer documents for itself", () => {
    expect(installer).toContain(INSTALL_COMMAND);
  });

  it("names the same minimum node version the installer refuses below", () => {
    const declared = installer.match(/NODE_MIN=(\d+)/);
    expect(declared, "install.sh no longer declares NODE_MIN").not.toBeNull();
    expect(requirements).toContain(`node ${declared?.[1] ?? ""}`);
  });

  it("says Linux only, because the installer refuses macOS and Windows outright", () => {
    expect(installer).toMatch(/Darwin\)\s*die/);
    expect(installer).toMatch(/Windows_NT\)\s*die/);
    expect(requirements).toContain("Linux only");
  });

  it("names corepack, which is how the installer obtains pnpm", () => {
    expect(installer).toContain("corepack enable pnpm");
    expect(requirements).toContain("corepack");
  });

  it("names git, which the installer needs on the fetch path", () => {
    expect(installer).toContain("need git");
    expect(requirements).toContain("git");
  });
});

describe("the markup and the enhancement script agree", () => {
  const enhance = readFileSync(join(packageDir, "src", "client", "enhance.ts"), "utf8");

  // The generator and the browser script are built separately and share no
  // types, so the only thing keeping the button alive is that both sides spell
  // the attribute the same way. Rename one and this fails instead of shipping
  // a dead control.
  it("looks for the attribute the page emits", () => {
    expect(enhance).toContain(`[data-${COPY_ATTRIBUTE}]`);
    expect(live).toContain(`data-${COPY_ATTRIBUTE}="`);
  });

  it.each(["copy-status", "copy-done"])("reads the %s attribute the page emits", (attribute) => {
    expect(enhance).toContain(`data-${attribute}`);
    expect(live).toContain(`data-${attribute}="`);
  });

  it("unhides the control only after finding a usable clipboard", () => {
    const guardAt = enhance.indexOf("navigator.clipboard");
    const unhideAt = enhance.indexOf("control.hidden = false");
    expect(guardAt).toBeGreaterThan(-1);
    expect(unhideAt).toBeGreaterThan(guardAt);
  });
});

describe("the page cannot go live carrying invented numbers", () => {
  /** A stat with a value and a runnable source: the "then it passes" state. */
  function measured(stat: DogfoodStat): DogfoodStat {
    return { ...stat, value: "42", blockedOn: undefined };
  }

  // THIS IS THE GUARD. Flipping INSTALL_LIVE to true while any stat is still
  // unmeasured turns this red. It is the reason the flag is safe to flip
  // without re-reading the whole page first.
  it("has nothing blocking the state it actually ships", () => {
    expect(releaseBlockers(RELEASE)).toEqual([]);
  });

  it("blocks a live release while any stat is unmeasured, and names each one", () => {
    const blockers = releaseBlockers({ installLive: true, stats: DOGFOOD_STATS });
    expect(blockers).toHaveLength(DOGFOOD_STATS.filter((stat) => stat.value === null).length);
    for (const stat of DOGFOOD_STATS) {
      if (stat.value !== null) continue;
      expect(blockers.some((blocker) => blocker.includes(stat.id))).toBe(true);
      expect(blockers.some((blocker) => blocker.includes(stat.source))).toBe(true);
    }
  });

  it("stops blocking once every stat has been measured", () => {
    expect(releaseBlockers({ installLive: true, stats: DOGFOOD_STATS.map(measured) })).toEqual([]);
  });

  /*
   * A number measured against work that is not merged is not evidence to a
   * reader: they cannot run the command that produced it. So a filled-in value
   * is not sufficient on its own -- the source has to be runnable too.
   */
  it("blocks a measured number whose command no reader can run yet", () => {
    const pending = DOGFOOD_STATS.map((stat) => ({
      ...measured(stat),
      blockedOn: "the tool that produces this is not merged",
    }));
    const blockers = releaseBlockers({ installLive: true, stats: pending });
    expect(blockers).toHaveLength(pending.length);
    expect(blockers.every((blocker) => blocker.includes("no reader can reproduce"))).toBe(true);
  });

  it("keeps at least one stat honest about not being runnable yet", () => {
    // Not a content assertion: it pins the invariant that any stat carrying a
    // `blockedOn` reason ships unmeasured, so the reason can never be the only
    // thing standing between an unrunnable command and a published number.
    for (const stat of DOGFOOD_STATS) {
      if (stat.blockedOn === undefined) continue;
      expect(stat.value, `stat ${stat.id} is blocked but carries a value`).toBeNull();
      expect(stat.blockedOn.trim()).not.toBe("");
    }
  });

  it("treats a blank value as unmeasured, not as measured", () => {
    const blank = DOGFOOD_STATS.map((stat) => ({ ...stat, value: "   " }));
    expect(releaseBlockers({ installLive: true, stats: blank })).toHaveLength(blank.length);
  });

  it("renders the sentinel where a number has not been measured", () => {
    expect(shipped).toContain(STAT_PLACEHOLDER);
    expect(shipped).toContain("stat__value--unmeasured");
  });

  it("renders the number, and no sentinel, once it has been measured", () => {
    const filled = indexPage({ installLive: true, stats: DOGFOOD_STATS.map(measured) });
    expect(filled).not.toContain(STAT_PLACEHOLDER);
    expect(filled).not.toContain("stat__value--unmeasured");
  });

  it("prints the command or query that regenerates every stat", () => {
    expect(DOGFOOD_STATS.length).toBeGreaterThan(0);
    for (const stat of DOGFOOD_STATS) {
      expect(stat.source.trim()).not.toBe("");
      expect(shipped, `no source printed for stat ${stat.id}`).toContain(escapeHtml(stat.source));
    }
  });

  it("gives every stat a label and a line of context, so no number stands alone", () => {
    for (const stat of DOGFOOD_STATS) {
      expect(stat.label.trim(), `stat ${stat.id} has no label`).not.toBe("");
      expect(stat.note.trim(), `stat ${stat.id} has no note`).not.toBe("");
      expect(shipped).toContain(escapeHtml(stat.label));
      expect(shipped).toContain(escapeHtml(stat.note));
    }
  });
});

describe("nothing in coming soon is written as though it already exists", () => {
  /**
   * Present-tense capability verbs: the words that turn a plan into a claim.
   * Matched on word boundaries, so "worked by two people" is not mistaken for
   * "works".
   */
  const PRESENT_TENSE = [
    "run",
    "runs",
    "support",
    "supports",
    "provide",
    "provides",
    "let",
    "lets",
    "ship",
    "ships",
    "handle",
    "handles",
    "work",
    "works",
    "give",
    "gives",
    "offer",
    "offers",
    "allow",
    "allows",
    "enable",
    "enables",
    "is available",
    "you can",
    "already works",
  ];

  /** Future or conditional: what every row must be written in instead. */
  const FUTURE = ["will", "would", "could"];

  function offendingVerbs(text: string): string[] {
    return PRESENT_TENSE.filter((verb) =>
      new RegExp(`\\b${verb.replace(/ /g, "\\s+")}\\b`, "i").test(text),
    );
  }

  it("is short: it is the unusual work, not the roadmap", () => {
    expect(COMING_SOON.length).toBeGreaterThan(0);
    expect(COMING_SOON.length).toBeLessThanOrEqual(5);
  });

  it.each(COMING_SOON.map((entry) => [entry.what, entry] as const))(
    "%s is stated in a future or conditional tense",
    (_label, entry) => {
      const marked = FUTURE.filter((marker) => new RegExp(`\\b${marker}\\b`, "i").test(entry.why));
      expect(marked.length, `no future-tense marker in: ${entry.why}`).toBeGreaterThan(0);
    },
  );

  it.each(COMING_SOON.map((entry) => [entry.what, entry] as const))(
    "%s uses no present-tense capability verb",
    (_label, entry) => {
      expect(offendingVerbs(`${entry.what} ${entry.why}`)).toEqual([]);
    },
  );

  it("carries no present-tense capability verb in the rendered rows either", () => {
    const section = markupBetween(shipped, 'id="coming-soon"', 'aria-labelledby="limits"');
    const rows = markupBetween(section, "<tbody>", "</tbody>");
    expect(offendingVerbs(textOf(rows))).toEqual([]);
  });

  it("says outright, in the section's own prose, that none of it exists", () => {
    const section = textOf(markupBetween(shipped, 'id="coming-soon"', 'aria-labelledby="limits"'));
    expect(section).toContain("None of it works yet");
  });

  it("carries the Lua guard rules row, with the reason they are interesting", () => {
    const lua = COMING_SOON.find(
      (entry) => entry.what.includes("Lua") && entry.what.includes("WASM"),
    );
    expect(lua, "the Lua guard rules row is missing").toBeDefined();
    expect(lua?.why).toContain("rules become expressive without becoming capable");
    // One sentence, so the reason is a reason and not a paragraph.
    expect((lua?.why ?? "").split(/(?<=\.)\s/).filter((part) => part.trim() !== "")).toHaveLength(
      1,
    );
  });

  it("renders the whole section into the document", () => {
    for (const entry of COMING_SOON) {
      expect(shipped).toContain(escapeHtml(entry.what));
      expect(shipped).toContain(escapeHtml(entry.why));
    }
  });
});

describe("the copy standard", () => {
  /*
   * The house voice, enforced rather than remembered.
   *
   * Thursday talks the way a computer talks: neutral, direct, declarative. The
   * argument is the mechanism, so the page has no need of adjectives about the
   * mechanism. These are the constructions that would mean the page had
   * drifted back into ordinary product writing, checked against both render
   * states because the release state is the one nobody looks at until the day
   * it ships.
   */
  const BANNED_PHRASES = [
    "get started",
    "ready to",
    "sign up",
    "try it now",
    "learn more",
    "unlock",
    "supercharge",
    "10x",
    "effortless",
    "seamless",
    "delight",
    "empower",
    "revolution",
    "game-chang",
    "best-in-class",
    "cutting-edge",
    "state of the art",
    "we are excited",
    "we're excited",
    "let's ",
    "simply ",
    "just works",
    "magic",
  ];

  const states: readonly (readonly [string, string])[] = [
    ["shipped", shipped],
    ["release", live],
  ];

  it.each(states)("%s: uses no exclamation mark", (_name, markup) => {
    expect(textOf(markup)).not.toContain("!");
  });

  it.each(states)("%s: carries no emoji", (_name, markup) => {
    expect(textOf(markup)).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
  });

  it.each(states)("%s: reaches for none of the banned constructions", (_name, markup) => {
    const text = textOf(markup).toLowerCase();
    const found = BANNED_PHRASES.filter((phrase) => text.includes(phrase));
    expect(found).toEqual([]);
  });

  /*
   * POSITIONING. Session boundaries, subagents and fronts are implementation,
   * not the product, so they do not belong in the page's own voice. The three
   * sanctioned mechanisms for the continuity claim are the board persisting
   * across sessions, the steering digest, and the shared workspace -- so the
   * word "session" is allowed where it names one of those, and nowhere else.
   */
  const NOT_FOREGROUNDED = [
    "subagent",
    "parallel front",
    "background agent session",
    "your session",
  ];

  it.each(states)("%s: does not foreground the implementation", (_name, markup) => {
    const text = textOf(markup).toLowerCase();
    const found = NOT_FOREGROUNDED.filter((term) => text.includes(term));
    expect(found).toEqual([]);
  });

  it("never claims a single process, which would be false", () => {
    const text = textOf(shipped).toLowerCase();
    for (const claim of ["single process", "one process", "same process"]) {
      expect(text, `the page claims: ${claim}`).not.toContain(claim);
    }
  });

  it("states the continuity claim through the mechanisms that deliver it", () => {
    // The section's own note, not the whole section: the panels below it name
    // these mechanisms too, so a section-wide search passes even after the
    // claim itself has been gutted. A mutation demonstrated exactly that.
    const section = markupBetween(shipped, 'aria-labelledby="board"', 'aria-labelledby="goals"');
    const note = section.match(/<p class="section__note">([\s\S]*?)<\/p>/);
    expect(note, "the board section has no note").not.toBeNull();
    const claim = textOf(note?.[1] ?? "");
    for (const mechanism of [
      "persists across sessions",
      "steering digest",
      "workspace is shared",
    ]) {
      expect(claim, `the continuity claim does not name: ${mechanism}`).toContain(mechanism);
    }
  });
});

describe("document structure", () => {
  /** Every heading, in document order, as its level. */
  function headingLevels(markup: string): number[] {
    return [...markup.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
  }

  it("has exactly one h1", () => {
    expect(headingLevels(shipped).filter((level) => level === 1)).toHaveLength(1);
  });

  it("opens with the h1", () => {
    expect(headingLevels(shipped)[0]).toBe(1);
  });

  /*
   * Every section announces itself with `aria-labelledby`, so the heading that
   * names a section is discoverable from the markup rather than by counting.
   * The lede is the h1 and every other section label is an h2 -- which is the
   * assertion that actually catches a demoted section heading. A plain
   * "no level is skipped" walk does not: the h3s inside the panels sit between
   * the section headings, so an h2 demoted to h4 still follows an h3 and slips
   * through. That weaker check was written first and a mutation caught it.
   */
  it("labels the lede with the h1 and every other section with an h2", () => {
    const labelled = [...shipped.matchAll(/aria-labelledby="([^"]+)"/g)].map(
      (match) => match[1] ?? "",
    );
    expect(labelled.length).toBeGreaterThan(5);
    const levels = labelled.map((id) => {
      const heading = shipped.match(new RegExp(`<h([1-6]) id="${id}"`));
      expect(heading, `no heading carries id="${id}"`).not.toBeNull();
      return Number(heading?.[1] ?? 0);
    });
    expect(levels[0], "the lede is not an h1").toBe(1);
    expect(levels.slice(1)).toEqual(levels.slice(1).map(() => 2));
  });

  it("leads with what the agent cannot do, and names the mechanism in its prose", () => {
    const hero = markupBetween(shipped, 'aria-labelledby="lede"', 'aria-labelledby="frustrations"');
    // The heading and the paragraphs only. The chips under the hero repeat
    // these words, so a test over the whole section passes even when the
    // writing has stopped saying anything -- which is exactly what a mutation
    // demonstrated. The h1 is included because the mechanism is stated there.
    const prose = textOf(
      [...hero.matchAll(/<(h1|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2] ?? "").join(" "),
    );
    expect(prose).toContain("cannot");
    for (const mechanism of ["write tool", "allowlist", "signoff"]) {
      expect(prose, `the hero's prose does not name: ${mechanism}`).toContain(mechanism);
    }
  });

  it("does not repeat the mechanism only in the chips", () => {
    // Guards the guard: if the chips ever became the only place these words
    // appear, the test above must still be reading the prose.
    const hero = markupBetween(shipped, 'aria-labelledby="lede"', 'aria-labelledby="frustrations"');
    const chips = textOf([...hero.matchAll(/<span class="chip">([\s\S]*?)<\/span>/g)].join(" "));
    expect(chips).toContain("allowlist");
  });
});
