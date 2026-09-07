# v0.1.0 release scope

REL1. This document is the cut. A ticket is in v0.1.0 or it is not, and every
ticket on the board is on exactly one of the two lists below.

The release date is Thursday 2026-09-10. It was reset to that date on
2026-09-07; earlier text in this plan that says "weekend" or "before Monday"
predates the reset and means this date.

## Green

v0.1.0 is done when one person can run this in under an hour and every line
passes. Each is pass or fail, with no judgement call.

1. On a machine with no dsh and no Thursday, one command installs Thursday.
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
9. The install command on trythursday.org is the one that was just tested.

10. The demo container starts, a visitor reaches a working session, and the
    container holds no credential and no personal file.
11. Thursday looks like Thursday: the skin, the mark, the fonts, and the
    thinking phrases are live, not stock dsh.

## What is allowed to be missing or ugly

Stated so nobody polishes the wrong thing at 3am.

- Linux only. macOS and Windows are not attempted, and the installer says so
  rather than half-working. Docker is a first-class path, not a workaround, so
  "works in Docker" is a release check and not a footnote.
- No editor, no file tree, no git panel, no plugin registry.
- No raw request and response inspector. TH6 stays out: it is a durable
  plaintext credential store if the redaction is wrong, and its own body admits
  the capture hook may not exist.
- The website is one page plus an install page. No blog, no docs site.
- Error messages may be terse, as long as they name the failing step.
- The migration is unfinished. Plugins install from where they already live.

## In v0.1.0

Foundation: R1, R2, R3, R4, R5, M1, D1.
Install: I1, I2, I4, I7, I8, I10, I11, I12.
Composition: C1, C2, C3, C4, C5, C6, A6, E5, A10.
First run: E1, E2, E3, E4, E6.
Plugins: P5.
Website: W1, W3, WS1, WS2, WS4, WS5.
Look: B1, B2, TH1, TH2, TH3, TH4.
Demo: E8, DM1, DM2, DM3, DM4, W4, RM1, RM2.
Process: REL1, REL2.

That is 49 tickets. See the risk below.

A10 was added after the first cut, on the user's call: it moves the aidos board
off dsh session projections onto its own append-only SQLite store. It is real
architectural work and it lands upstream in aidos rather than as a Thursday
fork, so E5 bumps its pin instead of forking. It is in scope because the board
outliving its session is the difference between a demo and a tool.

The look and the demo were added to v0.1.0 by the user after the first cut. Two
consequences follow and neither is optional.

RM2 BECOMES RELEASE-BLOCKING. The demo runs the real composition, and the real
composition installs `dsh-remote` from the pinned roster. So shipping the demo
ships a remote-access plugin on a public URL, and today no ticket has examined
its authentication or its exposure surface. DM3 bounds the container, not the
plugin inside it. RM1 and RM2 are therefore in v0.1.0: not for tidiness, but
because the alternative is putting an unexamined remote-access surface on the
internet. If RM2 finds something bad and cannot fix it in time, the demo ships
with `dsh-remote` removed from the demo composition, or it does not ship.

B1 AND B2 COME WITH THE SKIN. TH2 needs a mark to install and B2 needs B1's
inventory of which sizes the manifest and desktop entry require. Adding the skin
without them leaves TH2 unsatisfiable.

## Not in v0.1.0

Everything else on the board: A1-A5, A7, A8, A9, B3, B4, DM5, DOC1-DOC4, E7, E9,
G1, I3, I5, I6, I9, I13, I14, I15, MP1, MP2, N4-N8, P1, P2, P3, P4, P6, P7, P8,
RM3, S1, S2, S3, T1, T2, T3, TH5, TH6, TH7, V1-V8, W2, WK1-WK6, X1-X4.

Signoff does not mean in scope. Many of these are signed off and in progress on
the board so that work can start the moment v0.1.0 ships; that is deliberate and
it is not a scope change. The skin in v0.1.0 means TH1 to TH4. TH5, TH6 and TH7
are separate UI work and stay out.

N4 and N5 deserve a note, because they are the only cut items that would make
the rest of the release cheaper rather than more expensive: N4 removes roughly
fifteen approval prompts per session and N5 removes the bookkeeping that ate
most of the context in the planning phase. They are cut anyway, because
retooling the workshop during the build is how a deadline is missed. Do them
first after v0.1.0.

## Parallel and serial

Serial, and nothing else starts until they land: R1, then C1.

Parallel after R1: the website front (D1, WS1, WS2, WS4, WS5, W1, W3) shares
nothing with the rest. The install front (I11, I1, I2, I4, I7, I8) and the
composition front (C5, C2, C3, C6) can run alongside each other once C1 is done.
E5, A6 and I10 are small and independent. The first-run front (E1, E2, E4, E3)
is last because it needs a working install to run against.

REL1 and I11 are the only tickets startable today.

## The risk, and the trigger

The reviewer's arithmetic was right at 36 tickets, and the scope is now 48. The
single largest cost is the block model, I1 plus I2 plus I4 plus C4, which is
strictly more work than the eight things the installer actually does at v0.1.0.
The second largest is now the demo, which drags in the container, free-model
routing, safety bounding, and the two `dsh-remote` tickets behind it.

The block model stays, because it is what makes the work dispatchable in
parallel and what keeps `sync.sh`'s comment knowledge from being deleted in
translation. But the risk is real and it needs a trigger rather than optimism.

TRIGGER: if I1, I2 and I4 do not install a working composition by the halfway
point of the available time, drop to a direct `install.ts` that performs the
`sync.sh` steps in order with no block abstraction, and move I1, I2, I4 and C4
to v0.2. The direct installer is roughly 150 lines and is a known quantity.
Blocks are then reintroduced behind a working release rather than in front of
one.

Whoever is holding the release at that moment makes the call. Making it late is
worse than making it either way.
