const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/playwright",
  timeout: 30_000,
  workers: 1, // Required because tests modify shared global /config state
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:39091",
    headless: process.env.SHOWCASE === "true" ? false : true,
  },
  webServer: {
    command: 
      "echo 'ui_addr: \"127.0.0.1:39091\"\nlog_level: \"info\"\npublishers: []\nconsumers: []\nroutes: {}' > /tmp/mqb-playwright-minimal.yml && cargo run -- --config /tmp/mqb-playwright-minimal.yml",
    url: "http://127.0.0.1:39091/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
