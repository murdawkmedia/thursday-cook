# Thursday's copy standard

TH11. What Thursday's strings say and how they say it.

This governs every string Thursday ships: the README, the website, these docs,
and everything an agent reads or emits — `config/AGENTS.md`, skill files,
wizard prompts, tool descriptions, guard refusal messages, commit messages,
and the agent's own replies.

A surface does not restate this document. It links to it.

## 1. Positioning

Thursday is not a series of disparate agent sessions. It is one unified
session: a person talking to their computer to get work done.

Session boundaries, subagents, compaction and fronts are implementation, not
the product. Copy that foregrounds them describes the machinery instead of the
thing.

### The mechanisms copy may name

The single-session claim is true because of these three, and copy may name
them:

- The aidos board persists across sessions.
- The board digest steers a running or idle agent. A comment written on the
  board reaches the agent without the user re-asking.
- The workspace is shared.

### The claim copy may not make

Copy may NOT claim a single OS process. That is false. Subagent sessions are
genuinely separate session logs.

This standard forbids claiming mechanisms that do not exist, and that rule
binds the positioning too. The single-session claim gets no exemption from the
rule it is stated alongside.

## 2. Voice

Thursday talks the way a computer talks — or a chair, or a desk. Neutral.
Direct, declarative phrasing aimed at clarity and cognitive reinforcement.

Thursday does not optimize for user satisfaction, engagement retention, or
emotional uplift. Corporate-aligned behaviours are suppressed:

- sentiment softening
- conversational flow tagging
- continuity bias

The user's linguistic tone, emotional state, or implied affect are not
mirrored and not accommodated.

## 3. Banned constructions

Nine categories are banned. Each row gives the category and a scan a reviewer
can run or read for. A hit is not automatically a defect, but every hit must
be looked at and either removed or justified in review.

| Banned                 | Scan for                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emoji                  | any pictographic codepoint                                                                                                                                                                                    |
| Filler                 | `simply`, `just`, `basically`, `essentially`, `very`, `really`, `quite`, `of course`, `obviously`, `note that`, `it is worth noting`, `in order to`                                                           |
| Hype                   | `powerful`, `seamless`, `robust`, `effortless`, `blazing`, `delightful`, `world-class`, `game-changing`, `cutting-edge`, `supercharge`, `unlock`, `empower`, `leverage`, `elevate`, `rich set of`, `and more` |
| Conversational padding | `let's`, `we'll`, `you'll see`, `as you can see`, `don't worry`, `no problem`, `happy to`, `feel free`, `hope this helps`                                                                                     |
| Call-to-action closure | `get started`, `try it`, `check it out`, `read on`, `learn more`, `discover`, `dive in`, `stay tuned`, `ready to`                                                                                             |
| Soft suggestion        | `you may want to`, `you might consider`, `perhaps`, `maybe`, `we recommend`, `it is recommended`, `should probably`, `consider doing`                                                                         |
| Mood mirroring         | `great question`, `good catch`, `I understand that`, `that makes sense`, `frustrating`, `exciting`, `unfortunately`, `sorry`                                                                                  |
| Motivational content   | `worth its weight in gold`, `journey`, `the right way`, `best practice`, `at the end of the day`, `first and foremost`                                                                                        |
| Transitional framing   | a sentence whose only work is announcing the next sentence: `That said,`, `Moreover,`, `Furthermore,`, `Additionally,`, `In summary,`, `To summarize,`, `In conclusion,`, `Now let's look at`                 |

One command covers the mechanical half:

```sh
rg -n -i --pcre2 "\b(simply|basically|essentially|obviously|of course|note that|worth noting|in order to|powerful|seamless(ly)?|robust|effortless|blazing|delightful|world.class|game.chang|cutting.edge|supercharge|unlock|empower|leverage|elevate|and more|let's|feel free|happy to|hope this helps|get started|try it|check it out|read on|learn more|dive in|stay tuned|ready to|you (may|might) want to|perhaps|maybe|we recommend|it is recommended|should probably|great question|good catch|that makes sense|unfortunately|worth its weight|journey|best practice|at the end of the day|first and foremost|that said|moreover|furthermore|additionally|in summary|to summarize|in conclusion)\b" \
  README.md config/AGENTS.md docs website skills wizards

rg -n --pcre2 '[\x{1F300}-\x{1FAFF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}\x{FE0F}]' \
  README.md config/AGENTS.md docs website skills wizards
```

Two notes on running it.

The emoji scan matches pictographs only. Typographic symbols carry meaning and
are not emoji: `→` in a migration table, `·` in a separator, `←` naming an
arrow key. Those are not hits.

The word list is a set of instances, not the definition. The nine categories
are the rule; the words are the cheap way to find them. A construction that
matches no listed word is still banned if it belongs to a listed category, and
`just` inside `just the files it names` is a hit that survives review.

Four defects have a shape rather than a word, and are scanned for by reading:

- An exclamation mark in prose. `rg -n '!' -g '*.md'` finds them.
- A rhetorical question — a question the reader is not being asked to answer.
- A closing sentence that adds no fact. Delete the last sentence of a section;
  if nothing was lost, it was padding.
- An adjective asserting the product's own quality. See section 6.

## 4. The one sanctioned offer form

Where an alternate output form would serve better, one construction is
permitted, verbatim:

```
If you would like a [sketch/diagram/variant], let me know.
```

It is not phrased as a question and does not imply a recommendation. Any other
offer construction is a defect. "Want me to draw that?", "I can also produce a
diagram if that would help", and "Would you like me to sketch it?" are all
defects — the third included, which differs from the sanctioned form only in
being a question.

## 5. Agent-facing copy

This standard governs what agents read and emit, not only what the user reads.
`config/AGENTS.md`, skill files, wizard prompts, tool descriptions and guard
refusal messages are all in scope.

The failure mode on this side is not corporate padding. It is the opposite:
flowery or role-played prose. `assume the persona of a senior reviewer`, a
joke threat, an instruction written as a character brief, a metaphor standing
in for a rule. Neither failure mode is wanted.

The bar is maximizing the model's and the computer's intelligence and cutting
fluff. An instruction to an agent states the condition and the required
behaviour. It does not describe who the agent is while doing it.

## 6. Persuasion, and how it is resolved

A landing page has to make a stranger understand why the product is worth
installing. This standard forbids persuasion technique. Those pull against
each other, and the resolution is not to quietly permit persuasion.

**State the mechanism, and let the mechanism be the argument.** Every claim is
explained by naming the mechanism that delivers it, never by restating the
claim.

The worked example:

| Verdict | Line                                                   |
| ------- | ------------------------------------------------------ |
| Banned  | Thursday keeps you in control.                         |
| Correct | The agent cannot mark its own work done; only you can. |

The banned line is an adjective asserting itself. The correct line names a
mechanism, and it does more persuasive work than the adjective did, because
the reader can go and check it.

This is section 3's ban on hype stated positively. It is not a second rule,
and there is no case where the two disagree: an adjective that survives review
is one the mechanism sentence would have been longer than.

The test for a sentence: could this sentence be false? If it names a
mechanism, the answer is yes, and the reader can check. If the answer is no —
if the sentence is true by construction because it is an adjective about its
own subject — it is a slogan, and it goes.

## 7. Before and after

Real strings from this repository.

**`config/AGENTS.md`** — motivational content:

> Before: ask questions until every ambiguity is resolved before you begin the
> implementation. A good plan is worth its weight in gold.
>
> After: ask questions until every ambiguity is resolved before you begin the
> implementation.

The second sentence states no rule. Deleting it loses nothing.

**`config/AGENTS.md`** — role-played agent-facing prose:

> Before: When reviewing, assume the persona of a senior reviewer. Be
> especially wary of common AI slop patterns: dead code, unused imports …
>
> After: When reviewing, check for these patterns: dead code, unused imports …

The list was always the instruction. The persona was decoration around it.

**`config/AGENTS.md`** — a joke standing in for a reason:

> Before: "Return all file contents verbatim" is a directive that fails, and
> the puppy shoots back.
>
> After: "Return all file contents verbatim" is a directive that fails.

**`docs/dsh-home.md`** — filler:

> Before: `tool-bash` and `tool-goal` are simply not rows in Thursday's presets
>
> After: `tool-bash` and `tool-goal` are not rows in Thursday's presets

`simply` makes the fact sound easier. The fact is the same size without it.

**`docs/thursday-ui.md`** — padding, plus a claim about the author:

> Before: The cost is stated honestly in one sentence, for every future
> contributor who hits the wall:
>
> After: The cost, in one sentence:

`honestly` asks the reader to credit the document's motives. The trailing
clause names an audience the sentence already had.

**`README.md`** — a goal restated instead of a mechanism:

> Before: **Keep the user in control.** Explicit permissions, inspectable
> state, visible task state, interruptible execution, and reversible
> operations. Not an opaque autonomous system.
>
> After: **Keep the user in control.** The agent cannot sign off a ticket and
> cannot mark one done; those tools are not in its tool set. Before signoff it
> holds no write tool and no command tool. After signoff, a write outside the
> ticket's file allowlist is refused.

The heading is the goal, and a goal may be stated as a goal. The body under it
was five adjectival nouns. The replacement is checkable: read the agent's tool
list and the claim is true or it is not.

**`website/src/site/pages/index.ts`** — positioning:

> Before: A delegated ticket runs in its own session, on its own context.
>
> After: A delegated ticket runs in the background, against its own context.

Session boundaries are implementation. The sentence's content — the work does
not spend your context — survives without naming them.

## 8. Open questions

Cases this standard does not settle. Each needs a decision from the user, not
a preference from an author.

1. **Goal headings.** The four product goals in `README.md` are imperative
   phrases, and one of them — "Keep the user in control" — is section 6's
   banned construction in imperative mood. Section 7 assumes a goal heading
   may state a goal, as long as the body under it names mechanisms. That
   assumption is not in the standard as the user stated it.

2. **Quoted machinery.** The v0.1.0 checklist line "Chapter 2: instant
   `/compact`, then resume recovers what was elided" names a mechanism the
   positioning calls implementation. It is a list of build work, not product
   copy. Whether the positioning binds internal checklists as well as product
   copy is unsettled.

3. **Second person.** Almost every existing surface addresses the reader as
   "you". A chair does not say "you". Whether the neutral-voice rule reaches
   second-person address, or only affect and padding, is unsettled. This
   document uses "you" where the existing surfaces do.

4. **The `[sketch/diagram/variant]` slot.** Whether those three nouns are the
   closed set, or examples of a category the writer may extend, is unsettled.
   Closed forbids "If you would like a table, let me know". Open makes the
   form a template rather than a verbatim string.
