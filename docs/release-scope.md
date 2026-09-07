# v0.1.0 release scope

REL1. This document is the cut. A ticket is in v0.1.0 or it is not, and every
ticket on the board is on exactly one of the two lists below.

The release date is **Thursday 2026-09-10**, set on 2026-09-07.

## Who it is for

Stated on 2026-09-07, and it changes how several items below should be read.

v0.1.0 goes to COWORKERS AND FRIENDS. It is not a Hacker News launch; that comes
later, when the harness is more proven and much more polished. This release
exists to get people excited about what Thursday does and what is coming, and to
collect feedback and data from people who will actually tell you what happened.

Two consequences, and both cut against instincts the rest of this document
already encodes.

FIRST, THE SPECTACLE IS PART OF THE PRODUCT, not decoration to be cut when time
runs short. The skin, the mark, the thinking phrases and the tour's second
chapter are what make a colleague say "what is that". A release that installs
cleanly and looks like stock dsh has failed at its actual purpose, even with
every green item passing.

SECOND, COLLECTING FEEDBACK IS A GOAL, and a goal needs a mechanism. Nothing in
the cut currently provides one: there is no route by which a friend who hits a
bug or loves a feature tells you so. That gap is named here rather than assumed
away.

What does NOT change: the install must work on someone else's machine, and it
must not disturb an existing dsh. A release that breaks a colleague's setup
collects a different kind of feedback.

## The quality bar

Stated 2026-09-07, and it is a bar rather than an aspiration: v0.1.0 is already
polished and easy to use, and setting it up feels good rather than like homework.

The benchmark is concrete. AIDOS on its own took thirty minutes to explain to a
person. Using the harness must not feel like that. The tour introduces each
concept at the moment it becomes necessary rather than lecturing first, and a
user who finishes it is fully equipped to use aidos on their own work without
anyone explaining anything further.

That reframes the tour from a demonstration into the thing that replaces the
thirty-minute conversation. It also raises what "allowed to be ugly" below can
mean: terse error messages are acceptable, an onboarding that leaves the user
needing a phone call is not. Every earlier
"weekend" or "before Monday" reference in the plan predates that reset. The cut
below was resolved with the user by grill on 2026-09-07; the rulings and their
consequences are recorded at the end of this document.

## Green

v0.1.0 is done when one person can run this in under an hour and every line
passes. Each is pass or fail, with no judgement call.

1. On a machine with no dsh and no Thursday, one public command installs
   Thursday.
2. The wizard finishes with no paid account, by either of two zero-setup paths:
   a free provider, or an existing Claude subscription reached through meridian.
3. `thursday` with no arguments prints help, and `thursday serve` starts the
   server and opens a session in the Thursday preset.
4. The Quick preset is offered in the app's preset picker and a session opens in
   it. There is no `thursday quick`: preset choice is a session choice, made in
   the app, not a process choice made on the command line.
5. The tour workspace exists, its plan imports, and the board shows the tickets.
6. Chapter 1 completes: a ticket goes open to done, with the human half done by
   the human.
7. Chapter 2 completes: `/compact` visibly shrinks the session and resume
   recovers something elided.
8. `thursday uninstall` runs, and the byte-identity check reports the dsh tree
   unchanged.
9. The install command on trythursday.org is the one that was just tested, and
   the repository it fetches is public.
10. The author's own machine runs Thursday as its daily driver: E7's parity
    check passes, and `sync.sh` has not been run since. E7 owns the comparison
    and defines what it compares; this line is satisfied by that check being
    green, not by a judgement about whether the environment feels the same.
11. Thursday looks like Thursday: the skin, the mark, the fonts, and the
    thinking phrases are live, not stock dsh.

Item 10 is new, and it is the one item the author can fail privately before a
stranger fails it publicly. It is the composition cutover: the install engine
reproduces the working environment, and no repository moves to achieve it.

It originally read "artifact by artifact", which an independent review of
2026-09-07 correctly failed: `sync.sh` is about 1390 lines, "artifact" was
undefined, and comparing two system states against an undefined checklist is
not a pass-or-fail line runnable in under an hour. The check now points at E7,
whose own criterion already fixes the comparison. If E7 slips, this green item
slips with it rather than becoming a judgement call.

## What is allowed to be missing or ugly

Stated so nobody polishes the wrong thing at 3am.

- Native support is Linux only. macOS and Windows are reached through a
  container (V9): a wizard sets Thursday up under Docker or Podman, and the
  `thursday` command talks to that container so the user never types `docker`.
  This changed on 2026-09-07; the earlier text said macOS and Windows were not
  attempted at all. What is still missing natively is a Platform port, and the
  installer says which mode it is running rather than implying they are the
  same.
- **No browser demo.** Cut on 2026-09-07. It was nine unstarted tickets and it
  was the only thing that would have put a remote-access plugin on a public URL,
  which made RM2 release-blocking for a reason unrelated to the product.
- No editor, no file tree, no git panel, no plugin registry.
- No raw request and response inspector. TH6 stays out: it is a durable
  plaintext credential store if the redaction is wrong, and its own body admits
  the capture hook may not exist.
- The website is one page plus an install page. No blog, no docs site.
- Error messages may be terse, as long as they name the failing step.
- **The source migration is unfinished, and deliberately so.** Plugins install
  from where they already live (E7). Thursday becomes the author's environment
  by composition, not by absorbing the repositories. The physical merge of
  `aidos` and `dotfiles-ai` into `packages/` is the whole of v0.1.1.

## In v0.1.0

Foundation: R1, R2, R3, R4, R5, D1.
Install: I1, I2, I4, I7, I8, I10, I11, I12, E5, E7, A6.
Composition: C1, C2, C3, C4, C5, C6, A10.
Platform: V9, E8.
First run: E1, E2, E3, E4, E6.
Plugins: P5.
Website: W1, W3, WS1, WS2, WS4, WS5, PUB.
Look: B1, B2, TH1, TH2, TH3, TH4.
Dogfooding: RM2, N8, TH10.
Process: REL1, REL2, M3.

That is 51 tickets. PUB is new on 2026-09-07: publishing the repository is a
release task with an owner, because green items 1 and 9 are unsatisfiable while
the repository is private.

A10 stays in scope on the user's call and is the user's own work, upstream in
aidos rather than on a Thursday front. It moves the board off dsh session
projections onto an append-only SQLite store; the board outliving its session is
the difference between a demo and a tool.

TH10 is in scope on the user's call of 2026-09-07, and the reason is
onboarding rather than repair. Colleagues who already pay for Claude reach it
through meridian, so meridian is the path by which someone else's machine runs
Thursday with no setup at all -- no key to obtain, no account to create. That
makes a meridian fault a first-run failure for the people most likely to try
this, and the backlog fault is one those users cannot diagnose or recover from
on their own. A provider Thursday recommends is a provider whose known failure
Thursday must handle.

V9 AND E8 CAME BACK IN ON 2026-09-07, after the demo cut had removed E8. The
reason is reach rather than polish: macOS cannot be containerised the other way
round, so native support is weeks behind a Platform port that does not exist,
and without V9 the release tells most of the world to come back later. E8
returns only as the IMAGE — the substrate V9 installs into. The demo that made
E8 expensive stays cut: no public exposure, no free-model routing, no
`dsh-remote` on a public URL.

Say the arithmetic out loud, because this is the third addition since the cut
was drawn and an independent review had already failed the timeline as written:
scope has gone 49, then 48 when M1 left, then 51 with M3, V9 and E8. The
binding constraint is unchanged — the first-run chain — and V9 does not sit on
it, so this is not automatically fatal. But three days did not get longer. If
the cut order has to be used, it will be used sooner.

RM2 stays in scope for a changed reason. With the demo cut it is no longer about
public exposure; it is about the filesystem-sandbox faults that bite the author
in real remote sessions, and item 10 makes those faults a release concern.

## Not in v0.1.0

Everything else on the board: A1-A5, A7-A9, A11, B3, B4, DM1-DM5, DOC1-DOC4, E9,
G1, G2, I3, I5, I6, I9, I13, I14, I15, M1, M2, M4, MP1, MP2, N1-N7, N9, N10, N11,
N12, P1-P4, P6, P7, P8, RM1, RM3, S1, S2, S3, S4, S5, S6, T1, T2, T3, TH5, TH6,
TH7, TH8, TH9, TH11, TH13, TH14, TH15, V1-V8, W2, W4, WK1-WK6, X1-X4.

Fourteen of those were written on 2026-09-07 and are listed here the day they
were created, because the alternative is what an independent review caught twice
in one afternoon: a ticket on both lists, and a ticket on neither. The board grew
by more than twenty tickets that day without the release growing at all, which is
the intended behaviour of a cut — ideas land on the board, not in the release.

SEC1, PR1-PR9, AL1-AL4 and AN1-AN4 are also out. They come from the
cheap-model failure investigation of 2026-09-07 (`aidos/scratch/.../
cheap-model-eval/HANDOFF.md`, scratch-only by standing instruction) and they
build the partner-review gate, the ask ledger, and the remaining analysis. Two
notes on why they are out despite being the direct answer to a defect class this
release has already suffered. First, they are four phases of work in aidos and
dotfiles-ai, not three days of it. Second, the investigation's own economics say
to judge each fix by how many human interrupts it removes, and none of them
removes an interrupt before Thursday.

SEC1 is the exception in urgency though not in scope: a credential file was
printed into a session transcript, and rotation happens now rather than after
the release. It is in phase 0 for visibility, and it is release-adjacent for one
concrete reason — PUB makes the repository public, and a public repository is a
bad moment to discover which secrets are in which logs.

Signoff does not mean in scope. Many of these are signed off and in progress on
the board so that work can start the moment v0.1.0 ships; that is deliberate and
it is not a scope change.

M1 and M2 are out on the user's call of 2026-09-07, and the reasoning is worth
keeping because it looks like a contradiction. M1 builds the EXECUTABLE
migration map and M2 pilots the vendoring flow on two plugins; both are the
machinery of a source cutover, and the source cutover is v0.1.1's headline. But
the map itself must not go stale: the user is actively working in both `aidos`
and `dotfiles-ai` this week, and work that is not recorded before the cut is
work that gets rediscovered or lost at cutover. So M3 does one reconciliation
pass by hand before Thursday, and M1 automates it afterwards. The pass is in
scope; the machinery is not.

N8 is in scope on the user's call of 2026-09-07, and it is the only N ticket
that is. It earns its place from green item 10 rather than from tidiness: once
the author's daily driver is Thursday, a session log that will not open is a
working day lost, and `thursday-doctor` is the difference between a stranger's
broken install being diagnosable and being a bug report nobody can act on. It
carries a known defect, below, which must be fixed rather than shipped.

N4 and N5 deserve a note, because they are the only cut items that would make
the rest of the release cheaper rather than more expensive: N4 removes roughly
fifteen approval prompts per session and N5 removes the bookkeeping that ate
most of the context in the planning phase. They are cut anyway, because
retooling the workshop during the build is how a deadline is missed. Do them
first after v0.1.0.

TH11 is cut but already built and landed. A cut ticket that is finished is not
a scope change either.

**N8 ships with a defect open against it.** Its package is committed on `main`
today, and it writes session artifacts dsh cannot open
(the first zstd frame must be the header line alone; `encodeContainer` packs 64
records into it, and neither `diagnose` nor `verifyRepair` checks the framing).
Before the release it is fixed, or the package is reverted and N8 leaves the
cut. Shipping a repair tool that silently corrupts the thing it repairs is
worse than shipping no repair tool, and the incident that found this defect was
a real one: fifteen live session files re-encoded, and `dsh-web.service` dead at
`listArtifacts`.

## Parallel and serial

Serial, and nothing else starts until they land: R1, then C1. Both are done.

Six fronts carry the rest, and they share nothing that forces a wait:

| front | tickets |
| --- | --- |
| first run | E1, E2, E3, E4, then E6 |
| look | TH1, TH2, TH3, TH4 |
| composition | C2, C3, C6 |
| website | WS4, WS5, W1, W3, PUB |
| install finish | I11, E5, E7, A6 |
| session tooling | the N8 defect, then N8's remaining verification |
| process | REL2, and the meridian breaker already in flight |

The author holds A10 upstream and the verification queue. Verification is not a
front: it is the thing every front waits on, and it is the release's real
bottleneck.

THE TABLE ABOVE DOES NOT ACCOUNT FOR EVERY IN-SCOPE TICKET, and pretending
otherwise is how the arithmetic below flatters itself. Roughly twenty in-scope
tickets belong to no front:

- Landed or awaiting verification, needing only the author's check: R1, R2, R5,
  D1, C1, C4, C5, I1, I2, I4, I7, I8, I10, I12, B1, B2, WS1, WS2, TH10, N8.
- In scope, unstarted, and held by nobody: R3, R4, P5, I11, E5, E7, A6, W1,
  W3, WS4, WS5, PUB, RM2, REL1, REL2, M3, E8.
- In scope and just opened: V9, the container path for macOS and Windows.

The second list is the honest measure of what is left, and every item on it
either finds a front, gets cut, or moves the date.

## The risk, and the cut order

The arithmetic on 2026-09-07: of 51 in-scope tickets, about 20 are landed or
waiting on verification and about 16 are unstarted and held by nobody, against
three days. Six fronts landing one ticket each per day is 18, which looks
sufficient and is not, because the first-run chain cannot parallelise with
itself: E1, then E3, then E6, on one front, is the longest path in the release
and it is what the date must be measured against. The cut order below is
ordered by that path rather than by cost.

THE BINDING CONSTRAINT IS THE FIRST-RUN CHAIN, not the total ticket count. E1,
E3 and E6 run in sequence — the wizard configures what first boot opens, and
E6 verifies the whole lifecycle after both. An independent review of 2026-09-07
failed the previous cut order for beginning with TH3 and other cosmetics, which
sit on no critical path: cutting them frees a front that was never the
bottleneck and buys zero days. A cut order that does not cut the binding
constraint is decoration.

So the order below cuts the chain first, and the cosmetic items are last
because losing them costs appearance rather than time.

Cut in this order, one at a time, and only when a day ends behind:

1. Tour chapter 2. It reduces green item 7 to a documented paragraph and takes
   the largest single piece of authoring off E4, which is on the chain.
2. E6's CI half. Keep the byte-identity check and the one-command script a user
   can run; drop the CI job and the website's public statement of it until
   v0.1.1. The guarantee still holds and is still provable; only its
   advertisement waits.
3. E3's first-boot behaviour. The launcher opens the tour workspace by setting
   its working directory, which is one line; if even that slips, the tour is
   reached by typing `/teach-me-thursday` and E3 becomes documentation.
4. W3 and PUB automation: deploy the site and publish the repository by hand.
   The green items care that the command works, not that a wizard ran it.
5. TH3, the thinking phrases, and then the rest of the skin.
6. Last: the tour down to the wizard alone. If it goes, the release is an
   installer and a landing page, which is still a release.

Note what is NOT on this list: E1 and E2. The wizard is the first thing a
stranger meets and green items 2, 3 and 10 all depend on it. If E1 cannot land,
the release moves rather than shipping without it.

TRIGGER, unchanged and now dated: if I1, I2 and I4 do not install a working
composition by end of Tuesday 2026-09-08, drop to a direct `install.ts` that
performs the `sync.sh` steps in order with no block abstraction, and move I1,
I2, I4 and C4 to v0.2. The direct installer is roughly 150 lines and is a known
quantity. Blocks are then reintroduced behind a working release rather than in
front of one.

Whoever is holding the release at that moment makes the call. Making it late is
worse than making it either way.

## The grill of 2026-09-07

Five questions, five rulings, and what each one moved.

**What v0.1.0 is for.** Not the browser demo. The landing page is required, the
install must work on a stranger's machine, and the author must be able to
dogfood it. Moved: green item 10 added, green item 12 (the demo) deleted.

**The demo.** Out. Moved: E8, DM1-DM4, W4 and RM1 to Not in v0.1.0; RM2 kept for
a different reason. SUPERSEDED IN PART later the same day: E8 came back into
scope as V9's container image, though the demo itself stays cut. See the
Platform line above.

**First run.** The full wizard and tour, not a reduced version. Moved: E1, E2,
E3 and E4 all stay, and they are the largest unstarted block in the release.

**A10.** Stays, and the user does it upstream in aidos.

**Publishing.** Part of this week. Moved: PUB created; green items 1 and 9 now
name the public repository explicitly.

**The skin.** All four of TH1-TH4, on the argument that the author looks at it
every day once item 10 holds, and that the landing page needs a real screenshot.

**N8.** Kept, against the general cut of the N tickets. See the note in the Not
in v0.1.0 section for the reasoning and the open defect.

**The cutover.** Composition, not source. Thursday becomes the author's daily
environment by installing it, and the repositories merge in v0.1.1. This
preserves E7 rather than contradicting it: the earlier ruling was "installer
parity first, sources unmoved", and a source cutover before the release would
have reversed it at the cost of roughly 25 unstarted package moves.
