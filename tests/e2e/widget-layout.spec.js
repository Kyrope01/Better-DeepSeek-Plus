/**
 * E2E tests for BDS widget layout on large (desktop >= 768px) viewports.
 * Companion to the mobile-specific checks in tests/e2e-android/android.spec.js.
 * All tests run against the 1440x1100 Chrome viewport defined in the extension helper.
 */
import { test, expect } from "./helpers/extension.js";

test("does not render the floating corner button by default", async ({ page }) => {
  // The extension's settings live in DeepSeek's own Settings dialog; the corner
  // button is opt-in (settings.floatingButton === "always").
  await expect(page.locator("#bds-toggle")).toHaveCount(0);
});

test("bds-root is not full-width on desktop", async ({ page }) => {
  const rootWidth = await page.evaluate(() => document.querySelector("#bds-root").offsetWidth);
  const vp = page.viewportSize();
  expect(rootWidth).toBeLessThan(vp.width / 2);
});

test("bds-root uses fixed top-right positioning on desktop", async ({ page }) => {
  const { position, top, right } = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector("#bds-root"));
    return { position: cs.position, top: cs.top, right: cs.right };
  });
  expect(position).toBe("fixed");
  expect(parseInt(top)).toBeLessThanOrEqual(32);
  expect(parseInt(right)).toBeLessThanOrEqual(32);
});

test("drawer is right-anchored when opened on desktop", async ({ page }) => {
  await page.evaluate(() => window.__BDS_UI__.openDrawer());
  await expect(page.locator("#bds-drawer")).toHaveClass(/bds-open/);

  const drawerBox = await page.locator("#bds-drawer").boundingBox();
  const vp = page.viewportSize();
  expect(drawerBox).not.toBeNull();
  expect(drawerBox.x).toBeGreaterThan(vp.width / 2);
});

test("exposes the UI API the corner button used to provide", async ({ page }) => {
  const hasApi = await page.evaluate(() => typeof window.__BDS_UI__?.openDrawer === "function");
  expect(hasApi).toBe(true);
});
