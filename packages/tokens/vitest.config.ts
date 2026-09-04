import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../vitest.config.ts";

// Inherits the root resolve-extension order (sources beat stale build output)
// and adds nothing but this package's test directory.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["tests/**/*.test.ts"],
    },
  }),
);
