import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../vitest.config.ts";

// Inherits the root resolve-extension order and adds this package's tests.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["tests/**/*.test.ts"],
    },
  }),
);
