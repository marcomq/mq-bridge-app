const { test, expect } = require("@playwright/test");

async function openPublisherDefinition(page, index = 0) {
  await page.goto(`/#publishers:${index}`);
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
  await expect(page.locator("#route-config-form")).toBeVisible();
}

async function expectSaveButtonClean(page, buttonSelector) {
  await expect(page.locator(buttonSelector)).toHaveText("Save");
}

async function expectSaveButtonDirty(page, buttonSelector) {
  await expect(page.locator(buttonSelector)).toHaveText("Save *");
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
  await expectFormLabelAbsent(page, "URL");
  await expectFormLabelAbsent(page, "Method");

  await page.locator("#pub-list .pub-item").nth(1).click();
  await expect(page.locator("#pub-list .pub-item.active .item-name")).toHaveText("amqp_publisher");
  await page.locator("#pub-sub-tabs .content-tab", { hasText: "Definition" }).click();
  await expectFormLabelAbsent(page, "Queue");

  await page.locator("#pub-list .pub-item").nth(2).click();
  await expect(page.locator("#pub-list .pub-item.active .item-name")).toHaveText("kafka_publisher");
  await page.locator("#pub-sub-tabs .content-tab", { hasText: "Definition" }).click();
  await expectFormLabelAbsent(page, "Topic");

  await page.locator("#pub-list .pub-item").nth(3).click();
  await expect(page.locator("#pub-list .pub-item.active .item-name")).toHaveText("mongo_publisher");
  await page.locator("#pub-sub-tabs .content-tab", { hasText: "Definition" }).click();
  await expectFormLabelAbsent(page, "Database");
});

test("consumer custom response headers can be added and removed", async ({ page }) => {
  await openConsumerResponse(page, 0);
  await page.locator("#cons-response-editor").getByText("Add Header", { exact: true }).click();

  const rows = page.locator("#cons-response-editor .response-header-row");
  await expect(rows).toHaveCount(2);

  const newRow = rows.nth(1);
  await newRow.locator(".cons-response-header-key").fill("x-test");
  await newRow.locator(".cons-response-header-value").fill("123");
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
  await responseRows.last().locator(".cons-response-header-key").fill("x-new");
  await responseRows.last().locator(".cons-response-header-value").fill("123");
  await expectSaveButtonDirty(page, "#cons-save");
  await page.locator("#ctab-def").click();
  await page.locator("#cons-save").click();
  await expect(page.locator("#cons-save")).toHaveText("Saved");
  await expectSaveButtonClean(page, "#cons-save");

  await openRouteDefinition(page, 0);
  await formFieldByLabel(page, "#route-config-form", "Url").fill("127.0.0.1:39082");
  await expectSaveButtonDirty(page, "#route-save");
  await page.locator("#route-save").click();
  await expect(page.locator("#route-save")).toHaveText("Saved");
  await expectSaveButtonClean(page, "#route-save");
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
  const copyChoice = page.locator(".mqb-choice-link", { hasText: "New Consumer" });
  await expect(copyChoice).toBeVisible();
  await copyChoice.click();

  const input = page.locator(".mqb-dialog-input");
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("http_1");
  await input.fill("copied_http_consumer");
  await page.locator("wa-button", { hasText: "Create" }).click();

  await expect(page.locator("#mtab-consumers")).toHaveClass(/active/);
  await expect(page.locator("#cons-list .cons-item.active .item-name")).toHaveText("copied_http_consumer");
  await expect(page.locator("#cons-config-form")).toBeVisible();
  await expectSaveButtonDirty(page, "#cons-save");
  expect(consumerStatus404s).toEqual([]);
});

test("consumer can be copied to a new publisher for review", async ({ page }) => {
  await openConsumerDefinition(page, 0);

  await page.locator("#cons-copy").click();
  const copyChoice = page.locator(".mqb-choice-link", { hasText: "New Publisher" });
  await expect(copyChoice).toBeVisible();
  await copyChoice.click();

  const input = page.locator(".mqb-dialog-input");
  await expect(input).toBeVisible();
  await input.fill("copied_memory_publisher");
  await page.locator("wa-button", { hasText: "Create" }).click();

  await expect(page.locator("#mtab-publishers")).toHaveClass(/active/);
  await expect(page.locator("#pub-list .pub-item.active .item-name")).toHaveText("copied_memory_publisher");
  await expect(page.locator("#pub-config-form")).toBeVisible();
  await expectSaveButtonDirty(page, "#pub-save");
});

test("route can be copied to a new consumer for review", async ({ page }) => {
  await openRouteDefinition(page, 0);

  await page.locator("#route-copy").click();
  const copyChoice = page.locator(".mqb-choice-link", { hasText: "Input -> New Consumer" });
  await expect(copyChoice).toBeVisible();
  await copyChoice.click();

  const input = page.locator(".mqb-dialog-input");
  await expect(input).toBeVisible();
  await input.fill("route_input_consumer");
  await page.locator("wa-button", { hasText: "Create" }).click();

  await expect(page.locator("#mtab-consumers")).toHaveClass(/active/);
  await expect(page.locator("#cons-list .cons-item.active .item-name")).toHaveText("route_input_consumer");
  await expect(page.locator("#cons-config-form")).toBeVisible();
  await expectSaveButtonDirty(page, "#cons-save");
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
