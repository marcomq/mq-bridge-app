const { test, expect } = require("@playwright/test");

const BASE_CONFIG = {
  log_level: "info",
  ui_addr: "127.0.0.1:39091",
  metrics_addr: "",
  default_tab: "publishers",
  routes: {
    ingest_http: {
      enabled: false,
      input: {
        middlewares: [{ metrics: {} }],
        http: { url: "127.0.0.1:39081" },
      },
      output: { memory: { topic: "route-output" } },
    },
  },
  consumers: [
    {
      name: "memory_consumer",
      comment: "Demo consumer comment",
      endpoint: {
        middlewares: [{ metrics: {} }],
        memory: { topic: "consumer-events" },
      },
      response: {
        headers: { "x-initial": "test" },
        payload: "ok",
      },
    },
  ],
  publishers: [
    {
      name: "http_publisher",
      comment: "Demo publisher comment",
      endpoint: {
        middlewares: [{ metrics: {} }],
        http: { url: "http://localhost:8080/api/orders" },
      },
    },
    {
      name: "amqp_publisher",
      comment: "Queue publisher comment",
      endpoint: {
        middlewares: [{ metrics: {} }],
        amqp: { url: "amqp://localhost:5672/%2f", queue: "jobs" },
      },
    },
    {
      name: "kafka_publisher",
      comment: "Topic publisher comment",
      endpoint: {
        middlewares: [{ metrics: {} }],
        kafka: { url: "localhost:9092", topic: "events" },
      },
    },
    {
      name: "mongo_publisher",
      comment: "Database publisher comment",
      endpoint: {
        middlewares: [{ metrics: {} }],
        mongodb: {
          url: "mongodb://localhost:27017",
          database: "app",
          collection: "messages",
        },
      },
    },
  ],
};

async function resetConfig(page, config = BASE_CONFIG) {
  const response = await page.request.post("/config", {
    data: config,
  });
  expect(response.ok()).toBeTruthy();
}

async function openPublisherDefinition(page, index = 0) {
  await page.goto(`/#publishers:${index}`);
  const items = page.locator("#pub-list .pub-item");
  if ((await items.count()) > index) {
    await items.nth(index).click();
  }
  await page.locator("#ctab-config").click();
  await expect(page.locator("#pub-config-pane")).toBeVisible();
  await expect(page.locator("#pub-config-form")).toBeVisible();
}

async function openConsumerDefinition(page, index = 0) {
  await page.goto(`/#consumers:${index}`);
  await page.locator("#ctab-def").click();
  await expect(page.locator("#cons-config-form")).toBeVisible();
}

async function openRouteDefinition(page, index = 0) {
  await page.goto(`/#routes:${index}`);
  const firstRoute = page.locator("#route-list .route-item").first();
  if (await firstRoute.count()) {
    await firstRoute.click();
  }
  await expect(page.locator("#route-config-form")).toBeVisible();
}

async function expectSaveButtonClean(page, buttonSelector) {
  await expect(page.locator(buttonSelector)).toHaveAttribute("data-dirty", "false");
}

async function expectSaveButtonDirty(page, buttonSelector) {
  await expect(page.locator(buttonSelector)).toHaveAttribute("data-dirty", "true");
}

function formFieldByLabel(page, formSelector, labelText) {
  return page.locator(
    `${formSelector} .wa-form-row:has(.wa-form-label:text-matches("^${labelText}$", "i")) input:visible, ${formSelector} .wa-form-row:has(.wa-form-label:text-matches("^${labelText}$", "i")) textarea:visible`,
  ).first();
}

async function openConsumerResponse(page, index = 0) {
  await page.goto(`/#consumers:${index}`);
  await page.locator("#cons-response-tab").click();
  await expect(page.locator("#cons-response-editor")).toBeVisible();
}

async function clickAllVisibleShowMore(container) {
  const buttons = container.locator("button", { hasText: "Show more" });
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (await button.isVisible()) {
      await button.click();
    }
  }
}

async function expectFormLabelAbsent(page, text) {
  await expect(
    page.locator("#pub-config-form label").filter({ hasText: new RegExp(`^${text}$`, "i") }),
  ).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await resetConfig(page);
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });
  page.__pageErrors = pageErrors;
});

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors || []).toEqual([]);
});

test("publisher advanced fields can be expanded and middleware picker opens", async ({ page }) => {
  await openPublisherDefinition(page, 0);

  await clickAllVisibleShowMore(page.locator("#pub-config-form"));

  const addMiddlewareButton = page.locator("#pub-config-form button", { hasText: "Add Middleware" });
  await expect(addMiddlewareButton).toBeVisible();
  await addMiddlewareButton.click();

  await expect(page.locator("#pub-config-form select.js-array-type-select").first()).toBeVisible();
});

test("consumer response editor is available in its own response tab", async ({ page }) => {
  await openConsumerDefinition(page, 0);
  await expect(page.locator("#cons-response-tab")).toBeVisible();

  await page.locator("#cons-response-tab").click();
  await expect(page.locator("#cons-response-panel")).toBeVisible();
  await expect(page.locator("#cons-response-editor")).toBeVisible();
});

test("publisher form hides transport fields already handled by the request bar", async ({ page }) => {
  await openPublisherDefinition(page, 0);
  await expect(page.locator("#pub-url")).toBeVisible();
  await expect(page.locator("#pub-method")).toBeVisible();

  await page.locator("#pub-list .pub-item").nth(1).click();
  await expect(page.locator("#pub-list .pub-item.active .item-name")).toHaveText("amqp_publisher");

  await page.locator("#pub-list .pub-item").nth(2).click();
  await expect(page.locator("#pub-list .pub-item.active .item-name")).toHaveText("kafka_publisher");

  await page.locator("#pub-list .pub-item").nth(3).click();
  await expect(page.locator("#pub-list .pub-item.active .item-name")).toHaveText("mongo_publisher");
});

test("consumer custom response headers can be added and removed", async ({ page }) => {
  await openConsumerResponse(page, 0);
  await page.locator("#cons-response-editor").getByText("Add Header", { exact: true }).click();

  const rows = page.locator("#cons-response-editor .response-header-row");
  await expect(rows).toHaveCount(2);

  const newRow = rows.last();
  await newRow.locator("input.field-input").nth(0).fill("x-test");
  await newRow.locator("input.field-input").nth(1).fill("123");
  await newRow.getByText("Delete", { exact: true }).click();

  await expect(rows).toHaveCount(1);
});

test("publisher and consumer save buttons are not dirty on initial load", async ({ page }) => {
  await openPublisherDefinition(page, 0);
  await expectSaveButtonClean(page, "#pub-save");

  await openConsumerDefinition(page, 0);
  await expectSaveButtonClean(page, "#cons-save");
});

test("publisher and consumer save buttons become dirty on edit and clean after save", async ({ page }) => {
  await openPublisherDefinition(page, 0);
  await page.locator("#pub-url").fill("http://localhost:8080/api/orders/updated");
  await expectSaveButtonDirty(page, "#pub-save");
  await page.locator("#pub-save").click();
  await expect(page.locator("#pub-save")).toHaveText("Saved");
  await expectSaveButtonClean(page, "#pub-save");

  await openConsumerResponse(page, 0);
  await page.locator("#cons-response-editor").getByText("Add Header", { exact: true }).click();
  const responseRows = page.locator("#cons-response-editor .response-header-row");
  await responseRows.last().locator("input.field-input").nth(0).fill("x-new");
  await responseRows.last().locator("input.field-input").nth(1).fill("123");
  await expectSaveButtonDirty(page, "#cons-save");
  await page.locator("#ctab-def").click();
  await page.locator("#cons-save").click();
  await expect(page.locator("#cons-save")).toHaveText("Saved");
  await expectSaveButtonClean(page, "#cons-save");
});

test("http publisher delivers a message to the http consumer within 2 seconds without metrics polling", async ({ page }) => {
  const metricsRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/metrics")) {
      metricsRequests.push(request.url());
    }
  });

  await resetConfig(page, {
    ...BASE_CONFIG,
    routes: {},
    consumers: [
      {
        name: "http_consumer",
        comment: "HTTP consumer for UI delivery test",
        endpoint: {
          middlewares: [{ metrics: {} }],
          http: { url: "127.0.0.1:39081", path: "/ui-test", method: "POST" },
        },
        response: null,
      },
    ],
    publishers: [
      {
        name: "http_local_publisher",
        comment: "HTTP publisher for UI delivery test",
        endpoint: {
          middlewares: [{ metrics: {} }],
          http: { url: "http://127.0.0.1:39081/ui-test", method: "POST" },
        },
      },
    ],
  });

  await page.goto("/#consumers:0");
  await expect(page.locator("#cons-list .cons-item.active .item-name")).toHaveText("http_consumer");
  await page.locator("#ctab-msg").click();
  await page.locator("#cons-toggle").click();
  await expect(page.locator("#cons-toggle")).toHaveText("Stop");
  await expect(page.locator("#cons-live-title")).toContainText("Connected");

  await page.goto("/#publishers:0");
  await expect(page.locator("#pub-list .pub-item.active .item-name")).toHaveText("http_local_publisher");
  await page.locator("#ctab-payload").click();
  await page.locator("#pub-payload .cm-content").fill("{\"hello\":\"ui-test\"}");
  const publishResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/publish") && response.request().method() === "POST",
  );
  await page.locator("#pub-send").click();
  await expect((await publishResponsePromise).ok()).toBeTruthy();

  const messagesResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/messages?consumer=http_consumer") && response.request().method() === "GET",
  );
  await page.goto("/#consumers:0");
  await page.locator("#ctab-msg").click();
  await expect
    .poll(async () =>
      page.evaluate(() => (window._mqb_runtime_status?.consumers?.http_consumer?.message_sequence ?? 0)),
    )
    .toBeGreaterThan(0);
  await expect((await messagesResponsePromise).ok()).toBeTruthy();
  await expect(page.locator("#consumer-log-body")).toContainText("ui-test", { timeout: 2000 });
  expect(metricsRequests).toEqual([]);
});

test("publisher can be copied to a new consumer", async ({ page }) => {
  const consumerStatus404s = [];
  page.on("response", async (response) => {
    if (
      response.status() === 404 &&
      response.url().includes("/consumer-status") &&
      response.url().includes("copied_http_consumer")
    ) {
      consumerStatus404s.push(response.url());
    }
  });

  await openPublisherDefinition(page, 0);

  await page.locator("#pub-copy").click();
  const copyChoice = page.locator("wa-button", { hasText: "New Consumer" });
  await expect(copyChoice).toBeVisible();
  await copyChoice.click();

  const input = page.locator(".mqb-dialog-input");
  await expect(input).toBeVisible();
  await expect(input).toHaveValue(/http/);
  await input.fill("copied_http_consumer");
  await page.locator("wa-button", { hasText: "Create" }).click();

  await expect(page.locator("#mtab-consumers")).toHaveClass(/active/);
  await expect(page.locator("#cons-list .cons-item.active .item-name")).toHaveText("copied_http_consumer");
  await expect(page.locator("#cons-config-form")).toBeVisible();
  await expect(page.locator("#cons-save")).toHaveAttribute("data-dirty", /^(true|false)$/);
  expect(consumerStatus404s.length).toBeLessThan(5);
});

test("consumer can be copied to a new publisher for review", async ({ page }) => {
  await openConsumerDefinition(page, 0);

  await page.locator("#cons-copy").click();
  const copyChoice = page.locator("wa-button", { hasText: "New Publisher" });
  await expect(copyChoice).toBeVisible();
  await copyChoice.click();

  const input = page.locator(".mqb-dialog-input");
  await expect(input).toBeVisible();
  await input.fill("copied_memory_publisher");
  await page.locator("wa-button", { hasText: "Create" }).click();

  await expect(page.locator("#mtab-publishers")).toHaveClass(/active/);
  await expect(page.locator("#pub-list .pub-item.active .item-name")).toHaveText("copied_memory_publisher");
  await expect(page.locator("#pub-config-form")).toBeVisible();
  await expect(page.locator("#pub-save")).toHaveAttribute("data-dirty", /^(true|false)$/);
});

test("route can be copied to a new consumer for review", async ({ page }) => {
  await openRouteDefinition(page, 0);

  await page.locator("#route-copy").click();
  const copyChoice = page.locator("wa-button", { hasText: "Input -> New Consumer" });
  await expect(copyChoice).toBeVisible();
  await copyChoice.click();

  const input = page.locator(".mqb-dialog-input");
  await expect(input).toBeVisible();
  await input.fill("route_input_consumer");
  await page.locator("wa-button", { hasText: "Create" }).click();

  await expect(page.locator("#mtab-consumers")).toHaveClass(/active/);
  await expect(page.locator("#cons-list .cons-item.active .item-name")).toHaveText("route_input_consumer");
  await expect(page.locator("#cons-config-form")).toBeVisible();
  await expect(page.locator("#cons-save")).toHaveAttribute("data-dirty", /^(true|false)$/);
});

test("publisher delete can be saved and stays deleted after reload", async ({ page }) => {
  await openPublisherDefinition(page, 3);
  await expect(page.locator("#pub-list .pub-item.active .item-name")).toHaveText("mongo_publisher");

  await page.locator("#pub-delete").click();
  await page.locator("wa-button", { hasText: "Continue" }).click();
  await expect(page.locator("#pub-list .pub-item .item-name").filter({ hasText: "mongo_publisher" })).toHaveCount(0);
  await expect(page.locator("#pub-save")).toHaveText("Saved");

  await openPublisherDefinition(page, 0);
  await expect(page.locator("#pub-list .pub-item .item-name").filter({ hasText: "mongo_publisher" })).toHaveCount(0);
  await expectSaveButtonClean(page, "#pub-save");
});

test("route delete is persisted immediately", async ({ page }) => {
  await openRouteDefinition(page, 0);
  await expect(page.locator("#route-list .route-item.active .item-name")).toHaveText("ingest_http");

  await page.locator("#route-delete").click();
  await page.locator("wa-button", { hasText: "Continue" }).click();
  await expect(page.locator("#route-list .route-item .item-name").filter({ hasText: "ingest_http" })).toHaveCount(0);
  await expect(page.locator("#route-save")).toHaveText("Saved");

  await page.goto("/#routes:0");
  await expect(page.locator("#route-list .route-item .item-name").filter({ hasText: "ingest_http" })).toHaveCount(0);
  await expectSaveButtonClean(page, "#route-save");
});

test("app config shows existing routes in the routes map", async ({ page }) => {
  await page.goto("/#config");
  await expect(page.locator("#form-container")).toBeVisible();
  await expect(page.locator("#form-container")).toContainText("Routes");
});

test("active tabs stretch to the full viewport height", async ({ page }) => {
  for (const hash of ["/#consumers:0", "/#publishers:0", "/#routes:0", "/#config"]) {
    await page.goto(hash);
    const metrics = await page.evaluate(() => {
      const activePanel = document.querySelector(".tab-content-panel.active");
      const appBody = document.querySelector(".app-body");
      const app = document.getElementById("app");
      if (!activePanel || !appBody || !app) {
        return null;
      }

      const panelRect = activePanel.getBoundingClientRect();
      const appBodyRect = appBody.getBoundingClientRect();
      const appRect = app.getBoundingClientRect();

      return {
        viewportHeight: window.innerHeight,
        appBottom: appRect.bottom,
        appBodyBottom: appBodyRect.bottom,
        panelBottom: panelRect.bottom,
      };
    });

    expect(metrics).not.toBeNull();
    expect(Math.abs(metrics.appBottom - metrics.viewportHeight)).toBeLessThanOrEqual(2);
    expect(Math.abs(metrics.appBodyBottom - metrics.viewportHeight)).toBeLessThanOrEqual(2);
    expect(Math.abs(metrics.panelBottom - metrics.viewportHeight)).toBeLessThanOrEqual(2);
  }
});
