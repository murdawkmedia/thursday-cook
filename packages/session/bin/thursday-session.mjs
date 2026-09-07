#!/usr/bin/env node
/**
 * Entry point for `thursday session`. Kept to three lines on purpose: the
 * command surface lives in ../src/cli.mjs so it is unit-testable without a
 * process.
 */
import { main } from "../src/cli.mjs";
process.exitCode = await main(process.argv.slice(2));
