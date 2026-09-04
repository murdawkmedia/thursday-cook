# v0.1.0 release scope

REL1. This document is the cut. A ticket is in v0.1.0 or it is not, and every
ticket on the board is on exactly one of the two lists below.

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

## What is allowed to be missing or ugly

Stated so nobody polishes the wrong thing at 3am.

- It looks like stock dsh. No Thursday skin, no custom mark, no fonts.
- Linux only. macOS and Windows are not attempted, and the installer says so
  rather than half-working.
- No demo, no editor, no file tree, no git panel, no plugin registry.
- The website is one page plus an install page. No blog, no docs site.
- Error messages may be terse, as long as they name the failing step.
- The migration is unfinished. Plugins install from where they already live.

## In v0.1.0

Foundation: R1, R2, R3, R4, R5, M1, D1.
Install: I1, I2, I4, I7, I8, I10, I11, I12.
Composition: C1, C2, C3, C4, C5, C6, A6, E5.
First run: E1, E2, E3, E4, E6.
Plugins: P5.
Website: W1, W3, WS1, WS2, WS4, WS5.
Process: REL1, REL2.

That is 36 tickets. See the risk below.

## Not in v0.1.0

Everything else on the board: A1-A5, A7, A8, A9, B1, B2, B3, DM1-DM5, DOC1-DOC4,
E7, E8, E9, G1, I3, I5, I6, I9, I13, P1, P2, P3, P4, P6, P7, RM1, RM2, RM3, S1,
S2, S3, T1, T2, T3, TH1-TH7, V1-V8, W2, W4, WK1-WK5, X1-X4.

## Parallel and serial

Serial, and nothing else starts until they land: R1, then C1.

Parallel after R1: the website front (D1, WS1, WS2, WS4, WS5, W1, W3) shares
nothing with the rest. The install front (I11, I1, I2, I4, I7, I8) and the
composition front (C5, C2, C3, C6) can run alongside each other once C1 is done.
E5, A6 and I10 are small and independent. The first-run front (E1, E2, E4, E3)
is last because it needs a working install to run against.

REL1 and I11 are the only tickets startable today.

## The risk, and the trigger

The reviewer's arithmetic is right: 36 tickets with six human-approval gates is
not a weekend. The single largest cost is the block model, I1 plus I2 plus I4
plus C4, which is strictly more work than the eight things the installer
actually does at v0.1.0.

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
