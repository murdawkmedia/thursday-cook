import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../../vitest.config.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "mcp-servers",
      include: ["src/**/*.test.ts"],
    },
  }),
);
