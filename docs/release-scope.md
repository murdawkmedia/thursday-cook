# v0.1.0 release scope

REL1. This document is the cut. A ticket is in v0.1.0 or it is not, and every
ticket on the board is on exactly one of the two lists below.

The release date is **Thursday 2026-09-10**, set on 2026-09-07. Every earlier
"weekend" or "before Monday" reference in the plan predates that reset. The cut
below was resolved with the user by grill on 2026-09-07; the rulings and their
consequences are recorded at the end of this document.

## Green

v0.1.0 is done when one person can run this in under an hour and every line
passes. Each is pass or fail, with no judgement call.

1. On a machine with no dsh and no Thursday, one public command installs
   Thursday.
2. The wizard finishes with a free provider and no paid account.
3. `thursday` opens a session in the Thursday preset.
4. `thursday quick` opens a session in the Quick preset.
5. The tour workspace exists, its plan imports, and the board shows the tickets.
6. Chapter 1 completes: a ticket goes open to done, with the human half done by
   the human.
7. Chapter 2 completes: `/compact` visibly shrinks the session and resume
   recovers something elided.
8. `thursday uninstall` runs, and the byte-identity check reports the dsh tree
   unchanged.
9. The install command on trythursday.org is the one that was just tested, and
   the repository it fetches is public.
10. The author's own machine runs Thursday as its daily driver: `thursday
    install` reproduces the environment `sync.sh` produces today, artifact by
    artifact, and `sync.sh` is not run again.
11. Thursday looks like Thursday: the skin, the mark, the fonts, and the
    thinking phrases are live, not stock dsh.

Item 10 is new, and it is the one item the author can fail privately before a
stranger fails it publicly. It is the composition cutover: the install engine
reproduces the working environment, and no repository moves to achieve it.

## What is allowed to be missing or ugly

Stated so nobody polishes the wrong thing at 3am.

- Linux only. macOS and Windows are not attempted, and the installer says so
  rather than half-working. Docker is a first-class path for development, not a
  release check.
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

Foundation: R1, R2, R3, R4, R5, M1, D1.
Install: I1, I2, I4, I7, I8, I10, I11, I12, E5, E7, A6.
Composition: C1, C2, C3, C4, C5, C6, A10.
First run: E1, E2, E3, E4, E6.
Plugins: P5.
Website: W1, W3, WS1, WS2, WS4, WS5, PUB.
Look: B1, B2, TH1, TH2, TH3, TH4.
Dogfooding: RM2, N8.
Process: REL1, REL2.

That is 48 tickets. PUB is new on 2026-09-07: publishing the repository is a
release task with an owner, because green items 1 and 9 are unsatisfiable while
the repository is private.

A10 stays in scope on the user's call and is the user's own work, upstream in
aidos rather than on a Thursday front. It moves the board off dsh session
projections onto an append-only SQLite store; the board outliving its session is
the difference between a demo and a tool.

RM2 stays in scope for a changed reason. With the demo cut it is no longer about
public exposure; it is about the filesystem-sandbox faults that bite the author
in real remote sessions, and item 10 makes those faults a release concern.

## Not in v0.1.0

Everything else on the board: A1-A5, A7-A9, B3, B4, DM1-DM5, DOC1-DOC4, E8, E9,
G1, I3, I5, I6, I9, I13, I14, I15, MP1, MP2, N1-N7, P1-P4, P6, P7, P8, RM1, RM3,
S1, S2, S3, T1, T2, T3, TH5, TH6, TH7, TH8, TH9, TH10, TH11, V1-V8, W2, W4,
WK1-WK6, X1-X4.

Signoff does not mean in scope. Many of these are signed off and in progress on
the board so that work can start the moment v0.1.0 ships; that is deliberate and
it is not a scope change.

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

TH10 and TH11 are cut but already built: TH11 landed, and TH10 ships when its
front closes. A cut ticket that is finished is not a scope change either.

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

## The risk, and the cut order

The arithmetic on 2026-09-07: of 48 in-scope tickets, about 19 are landed or
waiting on verification and about 28 are unstarted, against three days. Six
fronts landing one ticket each per day is 18. The gap is real, so the cut order
is stated in advance rather than improvised on Wednesday night.

Cut in this order, one at a time, and only when a day ends behind:

1. TH3, the thinking phrases. Cosmetic within the skin.
2. W3 and PUB automation: deploy the site by hand and publish the repository by
   hand. The green items care that the command works, not that a wizard ran it.
3. Tour chapter 2, which reduces green item 7 to a documented paragraph.
4. RM2 to v0.1.1.
5. The block-model trigger below.
6. Last: the skin entirely, then the tour down to the wizard alone. If both go,
   the release is an installer and a landing page, which is still a release.

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
a different reason.

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
