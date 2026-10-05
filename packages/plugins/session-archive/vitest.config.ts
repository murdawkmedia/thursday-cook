import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../../vitest.config.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "session-archive",
      include: ["src/**/*.test.ts"],
    },
  }),
);
