import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../../vitest.config.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "composer-menu",
      include: ["src/**/*.test.ts"],
    },
  }),
);
