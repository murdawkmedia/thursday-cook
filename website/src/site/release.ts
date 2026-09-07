/**
 * The one switch that turns the pre-alpha page into the release page.
 *
 * WHY A FLAG AND NOT A REWRITE. The install command is finished: the markup,
 * the copy button, the requirements line and their tests all exist and are all
 * exercised. The only thing missing is the file at the other end of the URL.
 * Flipping `INSTALL_LIVE` to `true` swaps the honest pre-alpha notice for the
 * command, so release day is a one-line change with a test suite behind it
 * rather than a page rewrite performed under time pressure.
 *
 * DO NOT FLIP IT UNTIL BOTH OF THESE ARE TRUE:
 *   1. `https://trythursday.org/install.sh` actually serves `install/install.sh`,
 *      and the script it serves clones a repository that resolves. As of this
 *      writing `install/install.sh` still carries `TODO(I11/W3)` over a
 *      `REPO_URL` its own comment says is "NOT expected to resolve".
 *   2. Every entry in `DOGFOOD_STATS` has a measured `value`. `releaseBlockers`
 *      enforces this, and `tests/landing.test.ts` fails the build if it is
 *      violated, because a made-up number on a page about not making things up
 *      is the worst bug this site could ship.
 */

/**
 * Whether the install command is served at the URL it prints.
 *
 * THIS IS THE LINE TO FLIP. Nothing else changes on release day.
 */
export const INSTALL_LIVE = false;

/** The command, exactly as `install/install.sh` documents it in its header. */
export const INSTALL_COMMAND = "curl -fsSL https://trythursday.org/install.sh | sh";

/**
 * What the reader needs before running it.
 *
 * Each line is checked by `install/install.sh` itself and is quoted from what
 * that script actually refuses on, not from a guess:
 *   - platform: `case $os in Linux) ;; Darwin) die ... ;;` -- macOS and Windows
 *     are refused outright, with WSL2 and Docker named as the alternatives.
 *   - node: `NODE_MIN=24`, and the script dies below it.
 *   - pnpm: enabled through corepack when it is not already on PATH.
 *   - git: `need git` on the fetch path, skipped only when THURSDAY_SOURCE
 *     already points at a checkout.
 */
export const INSTALL_REQUIREMENTS: readonly string[] = [
  "Linux only at v0.1.0 — macOS and Windows are refused rather than half-supported; use WSL2 or the Docker image",
  "node 24 or newer",
  "pnpm, or corepack so the installer can enable it",
  "git, unless THURSDAY_SOURCE already points at a checkout",
];

/**
 * The sentinel a stat renders when nobody has measured it yet.
 *
 * It is deliberately not a number and not a dash: a reader must never be able
 * to mistake it for a measurement, and a grep must be able to find it.
 */
export const STAT_PLACEHOLDER = "NOT MEASURED YET";

export interface DogfoodStat {
  /** Stable key, used by tests and by whoever fills the value in. */
  readonly id: string;
  /** What the number counts, in the reader's terms. */
  readonly label: string;
  /**
   * The measured value, or `null` while nobody has measured it.
   *
   * `null` is the only honest state before publication. A plausible-looking
   * invented number would render identically to a real one, which is the
   * failure mode this whole module exists to make impossible.
   */
  readonly value: string | null;
  /** The command or query that regenerates `value`. Printed on the page. */
  readonly source: string;
  /** One line of context so the number is not left to speak for itself. */
  readonly note: string;
  /**
   * Set when `source` cannot be run by a reader yet, naming what is in the way.
   *
   * A measured number whose command nobody can run is not evidence; it is a
   * claim with a citation to a private document. `releaseBlockers` treats this
   * as blocking even when `value` is filled in, so a real measurement taken
   * against unmerged work cannot quietly become a published one.
   */
  readonly blockedOn?: string;
}

/**
 * Thursday's own board, measured at publish time.
 *
 * Every entry was checked for derivability before it was listed. Candidates
 * that were dropped, and why, are recorded in the ticket's report: token
 * totals are not project-scoped and not retained, so there is no honest way to
 * produce that number, and a stat nobody can regenerate is a stat nobody
 * should print.
 */
export const DOGFOOD_STATS: readonly DogfoodStat[] = [
  {
    id: "tickets",
    label: "tickets on Thursday's own board",
    value: null,
    source: "aidos board for this repository: get_tickets, rows counted",
    note: "Thursday's plan is an aidos board, and that board is the same one this page describes.",
  },
  {
    id: "review-fails",
    label: "tickets a review sent back at least once",
    value: null,
    source: "aidos board: tickets carrying a review_fail evidence row, over tickets reviewed",
    note: "Counts tickets where a review recorded a failure before the ticket was allowed to move.",
  },
  {
    id: "asides",
    label: "asides that became tickets instead of lost threads",
    value: null,
    // TWO HALVES ON PURPOSE. The first is the number worth printing, and it
    // depends on the board recording how a ticket was created -- which is not
    // confirmed today. The second is a cross-check that works right now,
    // because release-scope.md enumerates every ticket id at the cut. If the
    // first cannot be produced at publication, DROP THIS ROW rather than
    // estimate it: the cross-check alone counts "added after the cut", which
    // is a wider set than "raised as an aside".
    source:
      "aidos board: tickets created mid-session rather than by a plan import; cross-check against ids absent from docs/release-scope.md",
    note: "Put into the chat while the agent was working on something else, then filed as a ticket and done later.",
  },
  {
    id: "commits",
    label: "commits",
    value: null,
    source: "git rev-list --count HEAD",
    note: "Counted on the public repository, at the commit the site was built from.",
  },
  {
    id: "session-summary",
    label: "a long work log, rendered as a bounded summary",
    // MEASURED ALREADY, DELIBERATELY NOT PRINTED. Ticket N8, this session:
    // a 59.8 MB log of 198,000 events rendered as 1,962 tokens / 84 lines,
    // roughly 380x smaller than the raw dump; the 2,000-token / 160-line cap
    // held across 120 stress configurations; `recall <session> seq <range>`
    // returns the original content for the range asked for. Those numbers are
    // real and they stay here in a comment rather than on the page, because
    // N8 is not merged and a reader cannot run the command that produces
    // them. Move them into `value` and delete `blockedOn` in the same edit,
    // once the command exists in this repository.
    value: null,
    source:
      "thursday session summary <id>: summary tokens and lines against the raw log size; expand an exact range with `recall <session> seq <range>`",
    note: "The short form is capped and names what it truncated. The detail it omits is still addressed.",
    blockedOn:
      "N8 is built and tested but not merged into this repository, so no reader can run this command yet.",
  },
];

/** The render-time state of the page. Passed in so tests can render both. */
export interface ReleaseState {
  readonly installLive: boolean;
  readonly stats: readonly DogfoodStat[];
}

/** What the site actually ships with. */
export const RELEASE: ReleaseState = {
  installLive: INSTALL_LIVE,
  stats: DOGFOOD_STATS,
};

/**
 * Reasons this state must not be published, in the reader's interest.
 *
 * Empty means publishable. This is the mechanism behind "the page cannot go
 * live with fake numbers": it is a plain function over the shipped state, so
 * the test that guards release day is one assertion on its result rather than
 * a string search somebody can silently weaken.
 */
export function releaseBlockers(state: ReleaseState): string[] {
  if (!state.installLive) return [];
  const blockers: string[] = [];
  for (const stat of state.stats) {
    if (stat.value === null || stat.value.trim() === "") {
      blockers.push(`stat "${stat.id}" has no measured value; regenerate it with: ${stat.source}`);
    } else if (stat.blockedOn !== undefined && stat.blockedOn.trim() !== "") {
      blockers.push(
        `stat "${stat.id}" prints a number no reader can reproduce yet: ${stat.blockedOn}`,
      );
    }
  }
  return blockers;
}
