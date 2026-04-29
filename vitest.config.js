const viteConfig = require("./vite.config.js");
const { defineConfig, mergeConfig } = require("vitest/config");

module.exports = mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["tests/unit/**/*.test.ts"],
      coverage: {
        enabled: true,
        reporter: ["text", "html"],
      },
    },
  }),
);
