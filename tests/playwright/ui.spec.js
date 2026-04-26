const { test, expect } = require("@playwright/test");

async function openPublisherDefinition(page, index = 0) {
  await page.goto(`/#publishers:${index}`);
  await page.locator("#pub-sub-tabs .content-tab", { hasText: "Definition" }).click();
  await expect(page.locator("#pub-config-form")).toBeVisible();
}

async function openConsumerDefinition(page, index = 0) {
  await page.goto(`/#consumers:${index}`);
  await page.locator("#ctab-def").click();
  await expect(page.locator("#cons-config-form")).toBeVisible();
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

test("consumer response editor stays visible above the schema form", async ({ page }) => {
  await openConsumerDefinition(page, 0);

  const responseBox = await page.locator("#cons-response-editor").boundingBox();
  const formBox = await page.locator("#cons-config-form").boundingBox();

  expect(responseBox).not.toBeNull();
  expect(formBox).not.toBeNull();
  expect(responseBox.y).toBeLessThan(formBox.y);
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
  await openConsumerDefinition(page, 0);

  await expect(page.locator("#cons-response-editor")).toBeVisible();
  await page.locator("#cons-response-editor").getByText("Add Header", { exact: true }).click();

  const rows = page.locator("#cons-response-editor .response-header-row");
  await expect(rows).toHaveCount(2);

  const newRow = rows.nth(1);
  await newRow.locator(".cons-response-header-key").fill("x-test");
  await newRow.locator(".cons-response-header-value").fill("123");
  await newRow.getByText("Delete", { exact: true }).click();

  await expect(rows).toHaveCount(1);
});
