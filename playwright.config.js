const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/playwright",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:39091",
    headless: true,
  },
  webServer: {
    command:
      "cp tests/playwright/fixtures/ui-config.yml /tmp/mqb-playwright-ui-config.yml && cargo run -- --config /tmp/mqb-playwright-ui-config.yml",
    url: "http://127.0.0.1:39091/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
