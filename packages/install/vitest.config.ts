import { defineConfig, mergeConfig } from "vitest/config";

import base from "../../vitest.config.ts";

// The workspace base fixes resolve order (.ts before .js) and the
// tests/**/*.test.ts layout. This package only names itself, so a failure in
// a recursive run says which package it came from.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      name: "install",
    },
  }),
);
