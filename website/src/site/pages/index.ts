/**
 * The landing page.
 *
 * WHO IT IS WRITTEN FOR. Somebody who already uses a coding agent and has been
 * burned by one. It does not explain what an AI coding agent is, and it does
 * not sell productivity. It names failures the reader has personally had and
 * then names the mechanism that makes each one structurally impossible rather
 * than merely discouraged.
 *
 * THE ORGANISING IDEA. Every agent product describes what its agent can do.
 * The reader's actual damage came from what theirs could do and should not
 * have. So the page leads with the inversion -- capability withheld by
 * default, granted explicitly -- and states the mechanism in the same breath.
 *
 * TWO RULES THIS FILE KEEPS.
 *   1. Every claim is followed by the mechanism that delivers it. `CLAIMS`
 *      makes that structural: a claim without a named mechanism does not
 *      typecheck, and `tests/landing.test.ts` checks each mechanism reaches
 *      the page.
 *   2. The four goal headings are canonical, and this page reproduces them
 *      word for word. The canonical source is `docs/voice.md` section 7, not
 *      the README and not this file: neither surface may edit its copy alone.
 *      `tests/landing.test.ts` reads voice.md and compares. The body under
 *      each heading is this page's own, and names mechanisms under voice.md
 *      section 6.
 */
import { badge, button, callout, chip, command, flow, panel, stat, table } from "../components";
import { html, join, type Html } from "../html";
import { renderPage } from "../layout";
import {
  INSTALL_COMMAND,
  INSTALL_REQUIREMENTS,
  RELEASE,
  STAT_PLACEHOLDER,
  type ReleaseState,
} from "../release";

const DSH = "https://github.com/deepseek-ai/dsh";

/** The id the copy control targets. Shared with `command()` and the tests. */
export const INSTALL_COMMAND_ID = "install-command";

/**
 * The five claims this page makes, each carrying the mechanism that delivers
 * it.
 *
 * The first four `claim` strings are the four goals from the root README,
 * verbatim and in the README's order. `mechanism` is a noun: the thing in the
 * system that produces the claim. A restatement of the claim is not a
 * mechanism, and the body under it must name something a reader could go and
 * look at.
 */
export interface Claim {
  readonly claim: string;
  /** The named thing that delivers the claim. Rendered as the panel's badge. */
  readonly mechanism: string;
  /** True for the four canonical goals. Tested against docs/voice.md §7. */
  readonly canonical: boolean;
  readonly body: Html;
}

export const CLAIMS: readonly Claim[] = [
  {
    claim: "A wrong tool call is rewritten, not refused.",
    mechanism: "the guard layer",
    canonical: true,
    body: html`<p>
        A guard rule checks a tool call before it runs, and where the call has a form the rule knows
        how to correct, the guard translates it and runs the translation. A <code>find</code> call
        becomes the <code>fd</code> form; a <code>grep</code> call becomes <code>rg</code>. The
        model gets a result instead of an error it has to recover from.
      </p>
      <p>
        Where the call cannot be translated, the guard denies it and names why. The approach
        generalises: compensate for a weaker model at the system level rather than by reaching for a
        larger model.
      </p>`,
  },
  {
    claim: "Delegated work returns a result, not the exploration that produced it.",
    mechanism: "a context of its own",
    canonical: true,
    body: html`<p>
        A delegated ticket gets a written brief and runs against a context of its own, so its
        reading never enters yours. Your context pays for the brief and the result, not for the
        reading in between.
      </p>
      <p>
        Correctness is not the thing traded: the metric is useful work per token, not fewest tokens.
      </p>`,
  },
  {
    claim: "The plan is written and edited before it becomes tickets.",
    mechanism: "the plan imports to a board",
    canonical: true,
    body: html`<p>
        Planning happens before expensive execution, when the task earns it. The plan is a document,
        so it is edited as one, while it is still cheap to change.
      </p>
      <p>
        The plan imports to an aidos board, and a ticket is a bounded task an agent can finish on
        its own, carrying its own acceptance criteria and the list of files it may write.
      </p>`,
  },
  {
    claim: "The agent cannot sign off a ticket, and it cannot mark one done.",
    mechanism: "the tool set",
    canonical: true,
    body: html`<p>
        Signoff and done are human evidence kinds. The tools that supply them are not in the agent's
        tool set, so this is not a rule it is asked to follow. Before signoff it holds no write tool
        and no command tool.
      </p>
      <p>
        After signoff, a write outside the ticket's file allowlist is refused. A ticket moves state
        only when the required evidence exists, and a refused move names the evidence that is
        missing.
      </p>`,
  },
  {
    claim: "Work continues while you do something else, and returns as ticket state.",
    mechanism: "evidence attached to the ticket",
    canonical: false,
    body: html`<p>
        A delegated ticket runs in the background, against its own context. Your context stays free
        while it runs, so what you spend attention on is review rather than waiting.
      </p>
      <p>
        The work reports to the ticket as it goes: what it changed, what it ran, and what passed,
        each attached as evidence. A run is interruptible. What it leaves behind is ticket state on
        the board, not a chat log to read.
      </p>`,
  },
];

/** The four README goals, in order. The fifth claim is this page's own. */
const GOALS = CLAIMS.filter((entry) => entry.canonical);

/**
 * The claim about background execution, rendered in its own section.
 *
 * Deliberately not defensive: if the fifth claim is ever deleted, rendering
 * throws while the site is being built, rather than emitting a page with an
 * empty heading on it.
 */
const BACKGROUND: Claim = CLAIMS.filter((entry) => !entry.canonical)[0];

function claimPanel(entry: Claim): Html {
  return panel({ title: entry.claim, aside: badge(entry.mechanism), body: entry.body });
}

/**
 * The failures the reader has already had, each with the thing that makes it
 * structurally impossible.
 *
 * Written as symptoms, not features. "It edited forty files" is a sentence a
 * reader recognises; "bounded write scope" is a sentence they have to decode.
 */
export const FRUSTRATIONS: readonly { symptom: string; mechanism: string; body: Html }[] = [
  {
    symptom: "It edited forty files to fix one.",
    mechanism: "file allowlist",
    body: html`<p>
      A ticket names the files it may write. A write outside that list is refused before it happens,
      by the layer that owns the tool, so the diff you review was bounded before it was produced
      rather than after. There is no instruction telling the agent to stay in scope, because there
      is nothing there for it to disobey.
    </p>`,
  },
  {
    symptom: "It told you it was done.",
    mechanism: "the evidence gate",
    body: html`<p>
      Done is a state on a board, and no tool the agent holds reaches it. A ticket moves only when
      the evidence that state requires exists, and a refused move names the kind that is missing.
      Signoff is yours. Marking done is yours. Neither is a button the agent is trusted not to
      press; neither is a button it has.
    </p>`,
  },
  {
    symptom: "It spent an hour re-reading the same files.",
    mechanism: "the written brief",
    body: html`<p>
      A delegated ticket gets a brief and a context of its own. Your context pays for the brief and
      the result, not for the reading in between. What comes back is ticket state with evidence
      attached, not a transcript to read.
    </p>`,
  },
  {
    // WORDING NOTE. This is about where the list lives, not about the model
    // being forgetful. Any framing that locates the fault in the model's
    // attention is both a fight nobody needs on a landing page and, more to
    // the point, imprecise: the reason nothing is dropped is that the list was
    // never in the model's head to begin with.
    symptom: "An aside was acknowledged and never done.",
    mechanism: "the agent tickets it and continues",
    body: html`<p>
      Put an aside into the chat while the agent is working on something else — the top bar is
      broken, that origin check needs tightening. The agent files it as a ticket and continues with
      the current task. The ask is then a row on the board rather than a line in the transcript, and
      the board persists across sessions. The list is held by the board, not by you and not by the
      model.
    </p>`,
  },
  {
    symptom: "It quietly changed the plan halfway through.",
    mechanism: "the plan is a file",
    body: html`<p>
      The plan is reviewed as a document before anything executes, and it is on disk, so a
      compaction cannot take it. Each ticket carries the acceptance criteria it will be judged
      against. Scope stops being a thing you and the model each remember differently.
    </p>`,
  },
];

/**
 * What makes the inversion livable rather than merely safe.
 *
 * SUBORDINATE ON PURPOSE. These are not a fourth and fifth co-equal claim.
 * Withheld capability is what makes delegation safe; these two are what make
 * it something you would do all day rather than something you admire and then
 * go back to doing it yourself. The section sits directly under the
 * frustrations, because the first panel is the other half of the dropped-aside
 * one: chat is one way in, the board is the other.
 *
 * Both mechanisms were read in the source before they were described here.
 * `aidos/src/host/aidos-core.ts` delivers a board digest with
 * `live.steer(message)` rather than a quiet inject, and its own comment gives
 * the reason: "steer starts a turn for an idle agent and rides the next step
 * boundary for a running one, which is what 'tell the agent' means." The same
 * file caps that digest (`DIGEST_LINE_CAP`) and appends a pointer to the board
 * for the remainder, which is the bounded-view-with-an-expansion-path shape
 * the second panel describes.
 */
export const BOARD_SURFACE: readonly { title: string; mechanism: string; body: Html }[] = [
  {
    title: "A comment on a ticket reaches the agent.",
    mechanism: "steer, not inject",
    body: html`<p>
      Open the board while work is in progress. Reorder the tickets. Write a comment on one. aidos
      delivers board changes to the agent as a steering digest, and a comment is carried into that
      digest as a quoted block, in your words. Delivery is steer rather than inject: it starts a
      turn for an idle agent, and lands at the next step boundary for one already working. The agent
      is not polling, and it is not re-reading the ticket to find the change.
    </p>`,
  },
  {
    title: "The digest is bounded and names what it cut.",
    mechanism: "you choose the granularity",
    body: html`<p>
      The digest states what changed. When there is more than it will carry, it says how many
      changes it truncated, and the agent reads the board for the detail. The bound is the point: it
      is a bounded projection over state that is stored, not a summary that replaces it. Nothing is
      discarded to produce the short form, so the work can be read at the granularity you choose
      instead of as a wall of text.
    </p>`,
  },
];

/**
 * Small numbers as words, for a heading that counts its own contents.
 *
 * The heading used to say "all four of these" as a literal, which is a fact
 * about the list stored somewhere the list is not. Deriving it means adding a
 * panel cannot leave the heading lying.
 */
const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven"] as const;

export function countWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

/** First letter upper-cased, for a counted word at the head of a sentence. */
export function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Plan, tickets, background execution: the three stages, in order. */
const STAGES = [
  {
    label: "1 · plan",
    body: "A document, written before execution and reviewed as one. Edit it, reject it or rewrite it while it is still cheap.",
  },
  {
    label: "2 · tickets",
    body: "The plan imports to an aidos board. One ticket is one bounded task, carrying its files, its acceptance criteria and its dependencies.",
  },
  {
    label: "3 · background execution",
    body: "A ticket in progress is given an agent and a brief. It reports to the ticket while you carry on.",
  },
] as const;

/** The shape of the work, and the limit that applies at each step. */
const FLOW: readonly (readonly [string, string, string])[] = [
  [
    "1 · Understand",
    "The agent reads the repository and states the problem back to you before it proposes anything.",
    "Write a file. Run a command. No ticket is in progress, so it holds neither tool.",
  ],
  [
    "2 · Plan",
    "The plan is written as a document: the approach, the order of work, and the parts still unknown.",
    "Start implementing the plan it has just written.",
  ],
  [
    "3 · Ticket",
    "The plan imports to an aidos board. One ticket is one bounded task an agent can finish on its own.",
    "Leave scope open. The files it may write are part of the ticket.",
  ],
  [
    "4 · Delegate",
    "A ticket in progress is given an agent, the ticket text as its brief, and a context window of its own.",
    "Read your whole history. It gets the brief, not the transcript.",
  ],
  [
    "5 · Execute",
    "The work proceeds while you carry on. Checks and reports attach to the ticket as evidence as it goes.",
    "Attach your signoff. That kind of evidence is yours to give.",
  ],
  [
    "6 · Review and decide",
    "You read the diff and the evidence, then move the ticket on or send it back with a reason.",
    "Mark its own work done. The board waits for you.",
  ],
];

/**
 * Work that is genuinely unusual, not the roadmap.
 *
 * ENTRY RULE: an item earns a row here only if a reader who already uses
 * coding agents would not expect it from the others. An editor panel and a
 * plugin registry are ordinary and stay on the board.
 *
 * TENSE RULE: every `why` is future or conditional. Nothing in this table may
 * read as a thing that works today, because none of it does.
 * `tests/landing.test.ts` enforces both halves of that.
 */
export const COMING_SOON: readonly { what: string; why: string }[] = [
  {
    what: "Lua guard rules in a WASM sandbox",
    why: "Guard rules will move from brittle regex patterns to Lua, held inside a WASM sandbox, where rules become expressive without becoming capable.",
  },
  {
    what: "A terminal that is human-only by construction",
    why: "A terminal will sit in the workspace with no tool pointing at it, so a shell would stay something you use rather than something you delegate.",
  },
  {
    what: "Approval prompts only for what is new",
    why: "The approval surface will ask when you are granting a capability it has not seen before, so the fifteenth prompt of a session would carry information again.",
  },
  {
    what: "Shared boards over git or nostr",
    why: "The board's backing store will become pluggable, so a board could outlive one machine and be worked by two people with no server in the middle.",
  },
];

/**
 * The install call to action, in whichever of its two states is honest today.
 *
 * Both halves are finished and both are tested. `INSTALL_LIVE` in
 * `src/site/release.ts` chooses between them, and it stays `false` until the
 * URL in the command actually serves the installer. Printing the command
 * before then would invite a stranger to pipe a 404 into their shell, which is
 * a worse first impression than admitting there is nothing to install.
 */
function installBlock(release: ReleaseState): Html {
  if (!release.installLive) {
    return html`${callout(
        "warning",
        "Pre-alpha. Nothing installs yet.",
        html`<p>
          There is no release and no download. This page prints no install command until the command
          works. The rest of this page describes what is being built.
        </p>`,
      )}
      <p class="section__note">
        What it will need, when it lands: ${INSTALL_REQUIREMENTS.join(" · ")}.
      </p>`;
  }
  return html`${command({ id: INSTALL_COMMAND_ID, command: INSTALL_COMMAND })}
    <p class="section__note">Requirements: ${INSTALL_REQUIREMENTS.join(" · ")}.</p>`;
}

/** Thursday's own board, counted, with the command that counts it. */
function evidenceSection(release: ReleaseState): Html {
  const unmeasured = release.stats.filter((entry) => entry.value === null);
  return html`<section class="section" aria-labelledby="evidence">
    <h2 id="evidence">Counts from this project's own board</h2>
    <p class="section__note">
      Thursday's plan is an aidos board, and this page is a ticket on it. Each count below is
      printed with the command or query that produces it, so it can be re-derived by a reader who
      does not trust it.
    </p>
    ${
      unmeasured.length === 0
        ? null
        : callout(
            "warning",
            "These numbers have not been measured yet.",
            html`<p>
              Every value below is a placeholder, written so that it cannot be mistaken for a
              measurement. Each is filled in from the command beside it at publication. A test
              refuses to let the install command go live while any of them is still unmeasured.
            </p>`,
          )
    }
    <div class="grid">
      ${join(
        release.stats.map((entry) =>
          stat({
            value: entry.value ?? STAT_PLACEHOLDER,
            unmeasured: entry.value === null,
            label: entry.label,
            note: entry.note,
            source: entry.source,
          }),
        ),
      )}
    </div>
  </section>`;
}

export function indexPage(release: ReleaseState = RELEASE): string {
  const body = html`<div class="stack">
    <section class="section" aria-labelledby="lede">
      <p class="section__eyebrow">
        ${release.installLive ? "v0.1.0 · Linux" : "Pre-alpha · nothing installs yet"}
      </p>
      <h1 id="lede" style="font-size: var(--web-text-display)">
        An agent with no ticket in progress has no write tool and no shell.
      </h1>
      <p style="font-size: var(--web-text-lead); line-height: var(--web-leading-snug)">
        Thursday is an AI development environment built on
        <a href="${DSH}">DeepSeek Harness</a>. Once a ticket is in progress, every write outside
        that ticket's file allowlist is refused. The agent can attach a check that passed. It cannot
        attach your signoff, and it holds no tool that marks anything done.
      </p>
      <p>
        None of this is a rule the agent is asked to follow. The tools are not in its tool set. Most
        descriptions of an agent list the operations it can perform; these are the operations it
        cannot.
      </p>
      ${installBlock(release)}
      <div class="row">
        ${button({
          label: "The workflow, step by step",
          variant: "secondary",
          href: "#workflow",
        })}
      </div>
      <div class="row">
        ${chip("no write tool before signoff")} ${chip("per-ticket file allowlist")}
        ${chip("no mark-done tool")} ${chip("an aside becomes a ticket")}
        ${chip("background execution")}
      </div>
    </section>

    <section class="section" aria-labelledby="frustrations">
      <h2 id="frustrations">
        ${capitalise(countWord(FRUSTRATIONS.length))} failures, and the mechanism that prevents each
      </h2>
      <p class="section__note">
        This page assumes you already use a coding agent, so it skips the introduction. Each failure
        below is followed by the mechanism that makes it impossible, not by the wording that makes
        it less likely.
      </p>
      <div class="grid">
        ${join(
          FRUSTRATIONS.map((entry) =>
            panel({
              title: entry.symptom,
              aside: badge(entry.mechanism, "info"),
              body: entry.body,
            }),
          ),
        )}
      </div>
    </section>

    <section class="section" aria-labelledby="board">
      <h2 id="board">The board is an input surface, not only a display</h2>
      <p class="section__note">
        Work in Thursday is continuous rather than a set of separate sessions. Three things make
        that so: the board persists across sessions, board changes are delivered to the agent as a
        steering digest, and the workspace is shared.
      </p>
      <div class="grid">
        ${join(
          BOARD_SURFACE.map((entry) =>
            panel({
              title: entry.title,
              aside: badge(entry.mechanism, "info"),
              body: entry.body,
            }),
          ),
        )}
      </div>
    </section>

    <section class="section" aria-labelledby="goals">
      <h2 id="goals">What it is for</h2>
      <p class="section__note">
        Thursday has four goals, and every design decision answers to one of them. The four headings
        are canonical — their source is docs/voice.md — and each is followed by the mechanism that
        delivers it. A claim with no mechanism under it is a slogan.
      </p>
      <div class="grid">${join(GOALS.map(claimPanel))}</div>
    </section>

    <section class="section" aria-labelledby="background">
      <h2 id="background">${BACKGROUND.claim}</h2>
      <p class="section__note">
        This is not a fifth goal. It is one of the mechanisms the four above are paid for with.
      </p>
      <div class="row">${badge(BACKGROUND.mechanism)}</div>
      ${BACKGROUND.body}
    </section>

    <section class="section" aria-labelledby="workflow">
      <h2 id="workflow">The shape of the work</h2>
      <p class="section__note">
        Plan, then tickets, then background execution. Everything else on this page is a consequence
        of those three being separate steps.
      </p>
      ${flow(STAGES)}
      ${table({
        caption:
          "The same six steps in full, with the limit that applies at each one. Quick is this system with steps 3 to 5 removed and nothing else changed.",
        head: ["Step", "What happens", "What the agent cannot do here"],
        rows: FLOW.map(([step, happens, cannot]) => [
          html`<span class="table__mono">${step}</span>`,
          happens,
          cannot,
        ]),
      })}
    </section>

    <section class="section" aria-labelledby="aidos">
      <h2 id="aidos">aidos</h2>
      <p class="section__note">
        aidos is Thursday's planning and ticketing subsystem, not the product. It is the part that
        makes delegation safe enough to be worth doing.
      </p>
      <div class="grid">
        ${panel({
          title: "a ticket",
          aside: badge("bounded task"),
          body: html`<p>
            A ticket is a task an agent can finish on its own. It carries a description, the
            acceptance criteria it will be judged against, the tickets it depends on, and the list
            of files it is allowed to write.
          </p>`,
        })}
        ${panel({
          title: "evidence",
          aside: badge("proof, not claims"),
          body: html`<p>
            A state change needs proof: a check that ran, a review that passed, your signoff. An
            agent can attach the first two. It cannot attach the human half, because those tools are
            not given to it.
          </p>`,
        })}
        ${panel({
          title: "the gate",
          aside: badge("refuses, then explains"),
          body: html`<p>
            The gate refuses a move while the required evidence is missing, and it names the kind
            that is missing. It is not a warning to click through. There is no path around it for
            the agent, and none for you either.
          </p>`,
        })}
      </div>
      <p class="section__note">
        The name is a Greek word for the sense of respect that keeps people honest with each other.
        The rules apply to both sides: you cannot drop out of the loop either.
      </p>
    </section>

    <section class="section" aria-labelledby="presets">
      <h2 id="presets">Two presets, one installation</h2>
      <p class="section__note">
        One installation, one plugin set, one configuration. The difference is workflow overhead,
        not capability.
      </p>
      <div class="grid">
        ${panel({
          title: "Thursday",
          aside: badge("full environment"),
          body: html`<p>
            aidos, planning, ticketing, background execution, persistent state, and every supported
            plugin. It suits long-running or complex work, where a written plan and a bounded ticket
            cost less than the rework they prevent.
          </p>`,
        })}
        ${panel({
          title: "Quick",
          aside: badge("no ceremony"),
          body: html`<p>
            The same agent without the long-horizon surfaces, for work where ticketing would cost
            more than it returns. Rename this variable. Fix this type error. Explain this function.
            No board, no plan mode, no delegation; the same model, tools, and shell.
          </p>`,
        })}
      </div>
    </section>

    ${evidenceSection(release)}

    <section class="section" aria-labelledby="coming-soon">
      <h2 id="coming-soon">Coming soon</h2>
      <p class="section__note">
        Not the roadmap. Four items from the work after v0.1.0. Everything else belongs on the
        board, not on this page. None of it works yet.
      </p>
      ${table({
        head: ["What", "What it would change"],
        rows: COMING_SOON.map((entry) => [
          html`<span class="table__mono">${entry.what}</span>`,
          entry.why,
        ]),
      })}
    </section>

    <section class="section" aria-labelledby="limits">
      <h2 id="limits">Where to be sceptical</h2>
      <div class="grid">
        ${panel({
          title: "the workflow is not a bigger model",
          aside: badge("limit", "warning"),
          body: html`<p>
            The workflow removes failures caused by lost context and open scope. It does not add
            reasoning the model does not have. A task the model cannot do at all stays undone, and
            no amount of ticketing changes that.
          </p>`,
        })}
        ${panel({
          title: "those are counts, not benchmarks",
          aside: badge("limit", "warning"),
          body: html`<p>
            The section above counts this project's own board. It is not a comparison, it was not
            run against another tool, and it says nothing about how Thursday would do on your work.
            Treat any figure you have not run yourself as marketing, this site included.
          </p>`,
        })}
        ${panel({
          title: "the ceremony has a cost",
          aside: badge("limit", "warning"),
          body: html`<p>
            Writing a plan and cutting it into tickets takes time and tokens. On a small task that
            cost is larger than the return. That is the reason Quick exists, and it is an admission
            rather than a feature.
          </p>`,
        })}
      </div>
      <p class="section__note">
        The implementation plan and the board live in the repository, in the open. Thursday is MIT
        licensed and built on <a href="${DSH}">DeepSeek Harness</a>.
      </p>
    </section>
  </div>`;

  return renderPage({
    title: "Overview",
    description:
      "Thursday — an AI development environment built on DeepSeek Harness. An agent with no ticket in progress has no write tool and no shell. Writes are bounded by the ticket's file allowlist, and the agent holds no tool that marks work done.",
    current: "/",
    body,
  });
}
