import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../../vitest.config.ts";

// Inherits the root resolve-extension order (sources beat stale build output)
// and adds nothing but this package's test directory and a project name, the
// way @trythursday/tokens, thursday-mark and thursday-skin all do.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "thursday-tour",
      include: ["tests/**/*.test.ts"],
    },
  }),
);
