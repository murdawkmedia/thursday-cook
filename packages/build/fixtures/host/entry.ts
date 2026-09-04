// HOST-half fixture. Exercises the three things the host mode has to get
// right: a dsh package stays external, a node: builtin stays external, and an
// ordinary local/npm module is bundled in.
import { readFile } from "node:fs/promises";
// @ts-expect-error fixture: @deepseek-ai/* is external, never installed here.
import { something } from "@deepseek-ai/dsh-core";
import { greeting } from "./bundled-dep.js";

export default function apply(): string {
  void readFile;
  void something;
  return greeting("host");
}
