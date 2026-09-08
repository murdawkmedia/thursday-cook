import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../../vitest.config.ts";

// Inherits the root resolve-extension order (sources beat stale build output)
// and adds nothing but this package's test directory and a project name, the
// way @trythursday/tokens, thursday-skin and the website all do.
//
// thursday-fonts ships without one; that is the anomaly, not the pattern.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "thursday-thinking",
      include: ["tests/**/*.test.ts"],
    },
  }),
);
