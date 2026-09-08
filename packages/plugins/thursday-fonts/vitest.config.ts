import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../../vitest.config.ts";

// Inherits the root resolve-extension order (sources beat stale build output)
// and adds nothing but this package's test directory and a project name, the
// way @trythursday/tokens, thursday-skin, thursday-thinking, meridian-breaker
// and the website all do.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "thursday-fonts",
      include: ["tests/**/*.test.ts"],
    },
  }),
);
