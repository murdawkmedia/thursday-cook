/**
 * The landing page.
 *
 * Every claim here is stated as the mechanism that delivers it. A goal on its
 * own is a promise, and the reader this page is written for has been promised
 * things by AI tooling before. The four goal sentences are copied verbatim
 * from the repository root `README.md` and must stay identical to it.
 *
 * There is deliberately no install command: nothing installs yet, and a
 * command a reader can copy but cannot run is worse than no command at all.
 */
import { badge, button, callout, chip, panel, slot, table } from "../components";
import { html, join, type Html } from "../html";
import { renderPage } from "../layout";

const DSH = "https://github.com/deepseek-ai/dsh";

/**
 * The four goals, word for word as the root README states them, each paired
 * with the mechanism that delivers it rather than a restatement of it.
 */
const GOALS: readonly { goal: string; tag: string; body: Html }[] = [
  {
    goal: "Make cheap models useful.",
    tag: "goal 1",
    body: html`<p>
        A small model fails in predictable ways. It loses the thread in a long conversation. It
        guesses at scope. It edits a file nobody asked it to touch.
      </p>
      <p>
        Thursday takes those three jobs away from the model. The plan is a file, so it survives a
        compaction. The ticket carries its own acceptance criteria, so scope is written down instead
        of remembered. The allowlist names the files a ticket may write, so an edit outside them is
        refused rather than reviewed.
      </p>`,
  },
  {
    goal: "Get more useful work per token.",
    tag: "goal 2",
    body: html`<p>
        Most wasted tokens are re-read context: the same files, the same history, explored again
        because the last agent's understanding was never written down.
      </p>
      <p>
        A delegated ticket gets a written brief and its own context window. Your session pays for
        the brief and the result, not for the exploration in between. Correctness is not the thing
        being traded. The metric is useful work per token, not fewest tokens.
      </p>`,
  },
  {
    goal: "Front-load planning.",
    tag: "goal 3",
    body: html`<p>
        The plan is written before execution and reviewed as a document. You can edit it, reject it
        or rewrite it while it is still cheap to change.
      </p>
      <p>
        The plan then imports to a board as tickets. A ticket names its files, its acceptance
        criteria and the tickets it depends on. An agent that cannot state those has nothing to
        start. When a task does not earn a plan, you run Quick and none of this happens.
      </p>`,
  },
  {
    goal: "Keep the user in control.",
    tag: "goal 4",
    body: html`<p>
        The agent cannot sign off its own ticket, and it cannot mark anything done. Both moves are
        yours. The tools that make them are not in the agent's tool set, so this is not a rule the
        agent is asked to follow.
      </p>
      <p>
        Before signoff the agent can read and plan, but it cannot write a file or run a command.
        After signoff its writes stay inside that ticket's file allowlist. A ticket moves state only
        when the required evidence exists, and a refused move names the evidence that is missing.
      </p>`,
  },
];

function goalPanels(): Html {
  return html`<div class="grid">
    ${join(
      GOALS.map((entry) => panel({ title: entry.goal, aside: badge(entry.tag), body: entry.body })),
    )}
  </div>`;
}

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
    "A ticket in progress gets an agent, the ticket text as its brief, and a context window of its own.",
    "Read your whole session. It gets the brief, not the transcript.",
  ],
  [
    "5 · Execute",
    "The run happens in the background. Checks and reports attach to the ticket as evidence as it goes.",
    "Attach your signoff. That kind of evidence is yours to give.",
  ],
  [
    "6 · Review and decide",
    "You read the diff and the evidence, then move the ticket on or send it back with a reason.",
    "Mark its own work done. The board waits for you.",
  ],
];

export function indexPage(): string {
  const body = html`<div class="stack">
    <section class="section" aria-labelledby="lede">
      <p class="section__eyebrow">Pre-alpha · nothing installs yet</p>
      <h1 id="lede" style="font-size: var(--web-text-display)">
        The answer to a weak model should not always be a bigger one.
      </h1>
      <p style="font-size: var(--web-text-lead); line-height: var(--web-leading-snug)">
        Thursday is an AI development environment built on
        <a href="${DSH}">DeepSeek Harness</a>. It plans before it executes, cuts the plan into
        tickets, and gives an agent one bounded task at a time. The gain comes from the workflow
        around the model, not from paying for a larger one.
      </p>
      <div class="row">
        ${button({ label: "How the work flows", variant: "primary", href: "#workflow" })}
        ${button({ label: "Design system", variant: "secondary", href: "/design/" })}
      </div>
      <div class="row">
        ${chip("aidos tickets")} ${chip("background execution")} ${chip("file allowlists")}
        ${chip("thursday · quick")}
      </div>
    </section>

    <section class="section" aria-labelledby="status">
      <h2 id="status">Status</h2>
      ${callout(
        "warning",
        "Pre-alpha. Nothing here installs yet.",
        html`<p>
            There is no release and no download. This page carries no install command, because a
            command you can copy and cannot run is worse than no command.
          </p>
          <p>
            Read the rest as a specification of what is being built, and hold it to that. Each
            behaviour below is a rule the system enforces, not a habit an agent is asked to keep.
          </p>`,
      )}
    </section>

    <section class="section" aria-labelledby="goals">
      <h2 id="goals">What it is for</h2>
      <p class="section__note">
        Thursday has four goals, and every design decision answers to one of them. Each goal below
        is followed by the mechanism that delivers it. A claim with no mechanism under it is a
        slogan.
      </p>
      ${goalPanels()}
    </section>

    <section class="section" aria-labelledby="background">
      <h2 id="background">Background execution</h2>
      <p class="section__note">
        This is not a fifth goal. It is one of the mechanisms the four goals are paid for with.
      </p>
      <p>
        A delegated ticket runs in its own session, on its own context. Your session stays free
        while it runs, so the thing you spend attention on is review rather than waiting. The run
        reports back to the ticket: what it changed, what it ran, and what passed.
      </p>
      <p>
        A run is interruptible, and what it leaves behind is ticket state on a board rather than a
        chat log to scroll.
      </p>
    </section>

    <section class="section" aria-labelledby="workflow">
      <h2 id="workflow">The shape of the work</h2>
      <p class="section__note">
        Understand, plan, ticket, delegate, execute in the background, review — and then you decide
        what happens next.
      </p>
      ${table({
        caption:
          "The Thursday preset. Quick is the same system with steps 3 to 5 removed and nothing else changed.",
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
          title: "thursday",
          aside: badge("full environment"),
          body: html`<p>
            aidos, planning, ticketing, background execution, persistent state, and every supported
            plugin. Use it for long-running or complex work, where a written plan and a bounded
            ticket cost less than the rework they prevent.
          </p>`,
        })}
        ${panel({
          title: "thursday quick",
          aside: badge("no ceremony"),
          body: html`<p>
            The same system without the ticket overhead, for work where ticketing would cost more
            than it returns. Rename this variable. Fix this type error. Explain this function. The
            capability is not reduced; the process is.
          </p>`,
        })}
      </div>
    </section>

    <section class="section" aria-labelledby="install">
      <h2 id="install">Install</h2>
      <p>
        Installation is coming. There is no command on this page yet, and there will not be one
        until it has been run end to end on a clean machine by somebody who did not write it.
      </p>
      ${slot(
        "slot: install command",
        "The one command, in a <pre>, with the requirements line under it. It lands with the install page, which states what the installer writes, where it writes it, and how to remove it without a trace.",
      )}
    </section>

    <section class="section" aria-labelledby="limits">
      <h2 id="limits">Where to be sceptical</h2>
      <div class="grid">
        ${panel({
          title: "orchestration is not a bigger model",
          aside: badge("limit", "warning"),
          body: html`<p>
            The workflow removes failures caused by lost context and open scope. It does not add
            reasoning the model does not have. A task the model cannot do at all stays undone, and
            no amount of ticketing changes that.
          </p>`,
        })}
        ${panel({
          title: "no benchmark numbers",
          aside: badge("limit", "warning"),
          body: html`<p>
            There is no chart on this page. Nothing has been measured in a way worth defending, so
            nothing is printed. Treat any figure you have not run yourself as marketing, this site
            included.
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
      "Thursday — an AI development environment built on DeepSeek Harness. Planning, aidos tickets, bounded tasks and background execution get more out of a cheap model. Pre-alpha: nothing installs yet.",
    current: "/",
    body,
  });
}
