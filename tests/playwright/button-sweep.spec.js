/**
 * Dead-button sweep.
 *
 * Clicks every visible, enabled button in each main view and requires the click
 * to produce *some* observable effect. A button that changes nothing, requests
 * nothing and opens nothing is dead — that is the bug class this file exists to
 * find, and it scales to new buttons without anyone writing a test for them.
 *
 * Each button is clicked from a freshly reloaded page with a freshly reset
 * config, so one button's side effects cannot mask or break the next one.
 */
const { test, expect } = require("@playwright/test");
const { resetConfig, gotoView } = require("./helpers");

// Requests the app issues on a 1s timer; they prove nothing about a click.
const POLLING_PATHS = ["/runtime-status", "/peer-status"];
// Subtrees those pollers rewrite, excluded from the DOM signature.
const VOLATILE_SELECTORS = ["#runtime-status", "#peer-status"];

const VIEWS = [
  { name: "publishers", hash: "#publishers:0" },
  { name: "consumers", hash: "#consumers:0" },
  { name: "config", hash: "#config" },
];

// Buttons whose effect is deliberately outside anything a browser can observe.
// "Clear" empties the captured-message list; the sweep never runs a consumer, so
// the list is already empty and the re-render is identical. Seeding messages
// first would give it real coverage.
const EXPECTED_INERT = ["Clear"];

// Drag affordances exposed as buttons for keyboard users. They respond to drag,
// not to a plain click, so the sweep cannot judge them.
const DRAG_HANDLE = /^Resize /;

/** Record clipboard writes and object-URL creation; both are otherwise invisible. */
function installProbe() {
  const probe = { clipboard: 0, objectUrls: 0 };
  window.__mqbProbe = probe;

  const record = async () => {
    probe.clipboard += 1;
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText = record;
  } else {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: record },
      configurable: true,
    });
  }

  const createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    probe.objectUrls += 1;
    return createObjectURL(blob);
  };
}

/**
 * Tag light-DOM buttons so a click can address exactly the element we measured.
 * Playwright locators pierce shadow roots; querySelectorAll does not, so tagging
 * here keeps `wa-button`'s inner button out of the enumeration.
 *
 * The key is label + occurrence rather than a document-wide index: indices shift
 * whenever a panel renders a different number of buttons, which previously made
 * most of the inventory unmatchable on the second load.
 */
function tagButtons() {
  const buttons = document.querySelectorAll("button, wa-button");
  const seen = [];
  const labelCounts = new Map();
  buttons.forEach((element) => {
    const raw =
      element.getAttribute("title") ||
      element.getAttribute("aria-label") ||
      (element.textContent || "").trim() ||
      element.id ||
      element.className;
    const label = String(raw).replace(/\s+/g, " ").slice(0, 60);
    const occurrence = (labelCounts.get(label) || 0) + 1;
    labelCounts.set(label, occurrence);
    const key = `${label}#${occurrence}`;
    element.setAttribute("data-sweep-key", key);
    seen.push({
      key,
      label,
      id: element.id || null,
      visible: element.getClientRects().length > 0,
      disabled:
        element.disabled === true ||
        element.hasAttribute("disabled") ||
        element.getAttribute("aria-disabled") === "true",
      // An already-selected control (active tab, current theme) correctly does
      // nothing when clicked again; that is not a dead button.
      active:
        element.classList.contains("active") ||
        element.getAttribute("aria-selected") === "true" ||
        element.getAttribute("aria-pressed") === "true",
    });
  });
  return seen;
}

async function domSignature(page) {
  return page.evaluate((volatile) => {
    const clone = document.body.cloneNode(true);
    for (const selector of volatile) {
      clone.querySelectorAll(selector).forEach((node) => node.remove());
    }
    clone.querySelectorAll("[data-sweep-key]").forEach((node) => node.removeAttribute("data-sweep-key"));
    const html = clone.innerHTML;
    let hash = 5381;
    for (let index = 0; index < html.length; index += 1) {
      hash = ((hash * 33) ^ html.charCodeAt(index)) >>> 0;
    }
    return `${html.length}:${hash}`;
  }, VOLATILE_SELECTORS);
}

function isPolling(url) {
  return POLLING_PATHS.some((path) => url.includes(path));
}

/**
 * Changing only the hash is a same-document navigation, so the app keeps
 * whatever dialog the previous button opened — and an open modal swallows the
 * clicks that follow. Routing through about:blank forces a real remount.
 */
async function freshView(page, hash) {
  await page.goto("about:blank");
  await gotoView(page, hash);
}

test.describe("dead button sweep", () => {
  test("every visible button does something when clicked", async ({ page }, testInfo) => {
    testInfo.setTimeout(600_000);

    await page.addInitScript(installProbe);

    const requests = [];
    const pageErrors = [];
    let fileChoosers = 0;
    let downloads = 0;

    page.on("request", (request) => {
      if (!isPolling(request.url())) requests.push(request.url());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    // Registering this listener disables Playwright's auto-cancel, so the chooser
    // must be dismissed here — otherwise it stays open and blocks every
    // subsequent click in the sweep with an actionability timeout.
    page.on("filechooser", (chooser) => {
      fileChoosers += 1;
      void chooser.setFiles([]).catch(() => {});
    });
    page.on("download", () => {
      downloads += 1;
    });
    // The app uses its own wa-dialog, but never let a native one block the run.
    page.on("dialog", (dialog) => void dialog.dismiss().catch(() => {}));

    const findings = [];
    const skipped = [];
    let clicked = 0;

    for (const view of VIEWS) {
      await resetConfig(page);
      await freshView(page, view.hash);
      const inventory = (await page.evaluate(tagButtons)).filter((button) => {
        if (!button.visible) {
          skipped.push(`${view.name}: "${button.label}" (not visible)`);
          return false;
        }
        if (button.disabled) {
          skipped.push(`${view.name}: "${button.label}" (disabled)`);
          return false;
        }
        if (button.active) {
          skipped.push(`${view.name}: "${button.label}" (already active)`);
          return false;
        }
        if (DRAG_HANDLE.test(button.label)) {
          skipped.push(`${view.name}: "${button.label}" (drag handle)`);
          return false;
        }
        return true;
      });

      for (const button of inventory) {
        await resetConfig(page);
        await freshView(page, view.hash);
        const current = await page.evaluate(tagButtons);
        const match = current.find((entry) => entry.key === button.key);
        if (!match || !match.visible || match.disabled || match.active) {
          skipped.push(`${view.name}: "${button.label}" (not reachable on reload)`);
          continue;
        }

        const escapedKey = button.key.replace(/(["\\])/g, "\\$1");
        const target = page.locator(`[data-sweep-key="${escapedKey}"]`);
        const before = await domSignature(page);
        const hashBefore = page.url();
        requests.length = 0;
        pageErrors.length = 0;
        fileChoosers = 0;
        downloads = 0;

        let clickError = null;
        try {
          await target.click({ timeout: 5_000 });
          clicked += 1;
        } catch (error) {
          clickError = String(error).split("\n")[0];
        }

        // Give async handlers (fetch, dialog mount, Svelte flush) time to land.
        await page.waitForTimeout(500);

        const after = await domSignature(page);
        const probe = await page.evaluate(() => window.__mqbProbe || { clipboard: 0, objectUrls: 0 });

        if (clickError) {
          findings.push(`${view.name}: "${button.label}" — click failed: ${clickError}`);
          continue;
        }
        if (pageErrors.length > 0) {
          findings.push(`${view.name}: "${button.label}" — threw: ${pageErrors[0]}`);
          continue;
        }

        const alive =
          after !== before ||
          page.url() !== hashBefore ||
          requests.length > 0 ||
          fileChoosers > 0 ||
          downloads > 0 ||
          probe.clipboard > 0 ||
          probe.objectUrls > 0;

        if (!alive && !EXPECTED_INERT.includes(button.label)) {
          findings.push(`${view.name}: "${button.label}" — click had no observable effect`);
        }
      }
    }

    testInfo.attach("skipped-buttons", { body: skipped.join("\n"), contentType: "text/plain" });
    console.log(`swept ${clicked} buttons, skipped ${skipped.length}`);
    if (skipped.length > 0) console.log(`skipped:\n  ${skipped.join("\n  ")}`);

    expect(findings, `dead or broken buttons:\n  ${findings.join("\n  ")}`).toEqual([]);
  });
});
