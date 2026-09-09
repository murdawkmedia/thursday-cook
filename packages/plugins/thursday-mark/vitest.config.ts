import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../../vitest.config.ts";

// Inherits the root resolve-extension order (sources beat stale build output)
// and adds nothing but this package's test directory and a project name, the
// way @trythursday/tokens, thursday-skin and thursday-thinking all do.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "thursday-mark",
      include: ["tests/**/*.test.ts"],
    },
  }),
);
