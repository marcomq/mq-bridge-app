const { defineConfig } = require("vite");
const { svelte } = require("@sveltejs/vite-plugin-svelte");
const { resolve } = require("path");

const backendTarget = "http://127.0.0.1:39091";
const backendUrl = new URL(backendTarget);
const proxiedPaths = [
  "/health",
  "/schema.json",
  "/config",
  "/desktop-secrets",
  "/consumer-status",
  "/consumer-start",
  "/consumer-stop",
  "/messages",
  "/publish",
  "/runtime-status",
  "/metrics",
];

module.exports = defineConfig({
  plugins: [svelte()],
  server: {
    host: "127.0.0.1",
    port: 39092,
    proxy: Object.fromEntries(
      proxiedPaths.map((path) => [
        path,
        {
          target: backendTarget,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("origin", backendTarget);
              proxyReq.setHeader("referer", `${backendTarget}/`);
              proxyReq.setHeader("host", backendUrl.host);
            });
          },
        },
      ]),
    ),
  },
  build: {
    emptyOutDir: false,
    outDir: resolve(__dirname, "static"),
    rollupOptions: {
      input: {
        app: resolve(__dirname, "ui/src/main.ts"),
        legacy: resolve(__dirname, "ui/src/legacy-runtime.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
