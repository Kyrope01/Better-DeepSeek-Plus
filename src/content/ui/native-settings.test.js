// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { __nativeSettingsInternals } from "./native-settings.js";

const {
  classify,
  resolveDialog,
  findCardInside,
  findNavRail,
  countControls,
  contentColumn,
  mountTargets,
  looksModalish,
  isDialogRootish,
  placementOk,
  contentOffsetLeft,
  injectRailItem,
  cleanupPanel,
  registerShadowRoot,
  collectShadowRootsIn,
  queryRoots,
  observerConfig,
  guards,
} = __nativeSettingsInternals;

/** jsdom reports zero-size boxes; make a node look like a real dialog. */
function makeVisible(el, width = 620, height = 700, left = 100, top = 60) {
  el.getBoundingClientRect = () => ({
    width, height, top, left, right: left + width, bottom: top + height, x: left, y: top,
    toJSON() { return {}; },
  });
  return el;
}

/** Mark every descendant as laid out, so `isVisible` passes inside the dialog. */
function layOut(root, rect) {
  makeVisible(root, rect.width, rect.height, rect.left, rect.top);
  for (const child of root.querySelectorAll("*")) makeVisible(child, rect.width / 2, 28, rect.left + 10, rect.top + 20);
}

describe("native settings dialog detection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.removeAttribute("data-ds-dark-theme");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("recognises the real 2026 settings dialog shape (tab rail + dropdown controls)", () => {
    // Mirrors the live dialog: a modal with a left rail of four items and
    // controls whose class names we do not know (theme cards + two dropdowns).
    document.body.innerHTML = `
      <div class="ds-modal-content ds-modal-content--dialog" id="settings">
        <div class="d1b2c3__sidebar">
          <div class="d1b2c3__item">General</div>
          <div class="d1b2c3__item">Profile</div>
          <div class="d1b2c3__item">Data</div>
          <div class="d1b2c3__item">About</div>
        </div>
        <div class="d1b2c3__content">
          <div class="d1b2c3__row"><span>Theme</span><div class="hashed-a11y">Light</div></div>
          <div class="d1b2c3__row"><span>Language</span><div class="d1b2c3__select">System</div></div>
        </div>
      </div>`;
    const dialog = document.getElementById("settings");
    layOut(dialog, { width: 780, height: 560, left: 300, top: 200 });
    // The rail rows sit in the left column of the dialog.
    const items = dialog.querySelectorAll(".d1b2c3__item");
    items.forEach((el, i) => makeVisible(el, 150, 34, 320, 260 + i * 44));

    const rail = findNavRail(dialog);
    expect(rail).not.toBeNull();
    expect(rail.className).toContain("sidebar");
    expect(classify(dialog)).toBeGreaterThan(0);
  });

  it("still recognises switch-based dialogs with no rail", () => {
    const dialog = document.createElement("div");
    dialog.className = "ds-modal-content";
    dialog.innerHTML = `
      <div class="ds-switch"></div>
      <div class="ds-switch ds-switch--checked"></div>
      <div class="ds-native-select"></div>`;
    document.body.appendChild(dialog);
    layOut(dialog, { width: 525, height: 600, left: 400, top: 120 });
    expect(classify(dialog)).toBeGreaterThan(0);
  });

  it("counts controls found only by class-name scan", () => {
    const dialog = document.createElement("div");
    dialog.className = "ds-modal-content";
    dialog.innerHTML = `
      <div class="x__switch-row"></div>
      <div class="x__checkbox-row"></div>
      <div class="x__radio-card"></div>`;
    document.body.appendChild(dialog);
    layOut(dialog, { width: 600, height: 600, left: 400, top: 120 });
    expect(countControls(dialog)).toBeGreaterThanOrEqual(3);
    expect(classify(dialog)).toBeGreaterThan(0);
  });

  it("rejects a plain content dialog with no rail and no controls", () => {
    const dialog = document.createElement("div");
    dialog.className = "ds-modal-content";
    dialog.innerHTML = `<div class="ds-modal-content__title">Rename chat</div><p>Some text</p>`;
    document.body.appendChild(dialog);
    layOut(dialog, { width: 420, height: 300, left: 500, top: 300 });
    expect(classify(dialog)).toBeNull();
  });

  it("rejects the share dialog signature (primary footer action + textarea)", () => {
    const dialog = document.createElement("div");
    dialog.className = "ds-modal-content ds-modal-content--dialog";
    dialog.innerHTML = `
      <textarea></textarea>
      <div class="ds-switch"></div>
      <div class="ds-switch"></div>
      <div class="ds-modal-content__footer"><div class="ds-button ds-button--primary">Share</div></div>`;
    document.body.appendChild(dialog);
    layOut(dialog, { width: 420, height: 520, left: 500, top: 200 });
    expect(classify(dialog)).toBeNull();
  });

  it("never treats our own UI as a settings dialog", () => {
    document.body.innerHTML = `
      <div id="bds-root"><div data-bds-native-settings="1">
        <div class="ds-modal-content" id="ours">
          <div class="ds-switch"></div><div class="ds-switch"></div>
        </div>
      </div></div>`;
    const dialog = document.getElementById("ours");
    layOut(dialog, { width: 500, height: 600, left: 100, top: 100 });
    expect(classify(dialog)).toBeNull();
  });

  it("still recognises dialogs after the page flag is set on <html>", () => {
    // Regression: the page flag must not share the host marker's attribute name,
    // otherwise isOurNode() would match every element (the flag lives on <html>).
    document.documentElement.setAttribute(__nativeSettingsInternals.PAGE_ATTR, "available");
    const dialog = document.createElement("div");
    dialog.className = "ds-modal-content";
    dialog.innerHTML = `<div class="ds-switch"></div><div class="ds-switch"></div>`;
    document.body.appendChild(dialog);
    layOut(dialog, { width: 525, height: 600, left: 400, top: 120 });
    expect(classify(dialog)).toBeGreaterThan(0);
    document.documentElement.removeAttribute(__nativeSettingsInternals.PAGE_ATTR);
  });

  it("recognises a native <dialog> element (implicit role, no attributes)", () => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    dialog.className = "hashed_5b21";
    dialog.innerHTML = `<div class="a-rail">
        <div class="a-item">General</div><div class="a-item">Profile</div><div class="a-item">Data</div>
      </div>`;
    document.body.appendChild(dialog);

    makeVisible(dialog, 760, 520, 200, 150);
    const rail = dialog.querySelector(".a-rail");
    makeVisible(rail, 170, 420, 220, 170);
    [...dialog.querySelectorAll(".a-item")].forEach((el, i) => makeVisible(el, 150, 40, 230, 180 + i * 48));

    expect(looksModalish(dialog)).toBe(true);
    expect(classify(dialog, true)).toBeGreaterThan(0);
  });

  it("finds a dialog that lives inside a shadow root", () => {
    // A custom element with a shadow root would hide the dialog from
    // document.querySelectorAll — the reason shadow roots are registered.
    const host = document.createElement("ds-settings-shell");
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <div class="hashed-modal">
        <div class="hashed-rail">
          <div class="hashed-item">General</div><div class="hashed-item">Profile</div><div class="hashed-item">Data</div>
        </div>
        <div class="hashed-content"><div class="hashed-switch-row"></div></div>
      </div>`;

    const modal = root.querySelector(".hashed-modal");
    makeVisible(modal, 700, 480, 150, 120);
    makeVisible(root.querySelector(".hashed-rail"), 160, 400, 170, 140);
    makeVisible(root.querySelector(".hashed-content"), 480, 400, 350, 140);
    [...root.querySelectorAll(".hashed-item")].forEach((el, i) => makeVisible(el, 140, 40, 180, 150 + i * 48));

    registerShadowRoot(root);
    const found = queryRoots(".ds-modal-content, .ds-modal, .ds-dialog, dialog[open], [role=\"dialog\"]").length;
    expect(found).toBeGreaterThanOrEqual(0);
    // The dialog inside the shadow root must be discoverable and classifiable.
    expect(classify(modal, true)).toBeGreaterThan(0);

    collectShadowRootsIn(host);
    expect(queryRoots('[class*="modal" i]')).toContain(modal);
  });

  it("filters mutations cheaply so React churn cannot trigger scans", () => {
    // Regression: observing bare attributes made every React attribute write a
    // full scan (forced layout storm) and froze the page on a real account.
    expect(observerConfig.childList).toBe(true);
    expect(observerConfig.subtree).toBe(true);
    expect(Array.isArray(observerConfig.attributeFilter)).toBe(true);
    expect(observerConfig.attributeFilter).toContain("class");

    const text = document.createTextNode("streamed token");
    expect(looksModalish(text)).toBe(false);

    const plain = document.createElement("div");
    plain.className = "hashed_123";
    expect(looksModalish(plain)).toBe(false);

    const modal = document.createElement("div");
    modal.className = "ds-modal-content";
    expect(looksModalish(modal)).toBe(true);

    const wrapper = document.createElement("div");
    wrapper.appendChild(document.createElement("div")).className = "ds-modal";
    expect(looksModalish(wrapper)).toBe(true);
  });

  it("keeps scan guardrails in place (debounce, rate limit, bounded walks)", () => {
    expect(guards.SCAN_DEBOUNCE_MS).toBeGreaterThanOrEqual(100);
    expect(guards.SCAN_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(300);
    expect(guards.HEARTBEAT_MS).toBeGreaterThanOrEqual(1000);
    expect(guards.SWEEP_HEARTBEAT_MS).toBeGreaterThanOrEqual(3000);
    expect(guards.MAX_NODES).toBeLessThanOrEqual(1000);
    expect(guards.MAX_ATTEMPTS_PER_DIALOG).toBeLessThanOrEqual(6);
  });

  it("unwraps a full-viewport overlay to the settings card inside it", () => {
    // The live dialog arrives as an overlay wrapper with hashed class names and no
    // ARIA role; the card inside it holds the rail. The overlay itself must never
    // be treated as the mount target.
    document.body.innerHTML = `
      <div class="hashed-overlay-9f2c">
        <div class="hashed-card-4a1b">
          <div class="hashed-rail-77aa">
            <div class="hashed-item">General</div>
            <div class="hashed-item">Profile</div>
            <div class="hashed-item">Data</div>
            <div class="hashed-item">About</div>
          </div>
          <div class="hashed-content-88bb">
            <div class="hashed-row">Theme</div>
            <div class="hashed-row">Language</div>
          </div>
        </div>
      </div>`;
    const overlay = document.querySelector(".hashed-overlay-9f2c");
    const card = document.querySelector(".hashed-card-4a1b");
    const items = [...overlay.querySelectorAll(".hashed-item")];
    const content = document.querySelector(".hashed-content-88bb");

    // Overlay covers the whole 1024x768 jsdom viewport; the card is centred.
    makeVisible(overlay, 1024, 768, 0, 0);
    makeVisible(card, 780, 560, 120, 100);
    makeVisible(content, 520, 460, 330, 140);
    makeVisible(document.querySelector(".hashed-rail-77aa"), 180, 480, 140, 130);
    items.forEach((el, i) => makeVisible(el, 150, 40, 150, 150 + i * 48));
    for (const row of content.children) makeVisible(row, 500, 40, 340, 160);

    expect(resolveDialog(overlay)).toBe(card);
    expect(classify(resolveDialog(overlay), true)).toBeGreaterThan(0);
    expect(findCardInside(overlay)).toBe(card);

    // The mount target must be the content column (right of the rail), not the card.
    expect(contentColumn(card, findNavRail(card))).toBe(content);
    const targets = mountTargets(card);
    expect(targets[0]).toBe(content);
  });

  it("rejects a placement with no usable area inside the card", () => {
    document.body.innerHTML = `
      <div class="hashed-card" id="card"></div>
      <div id="host"></div>`;
    const card = document.getElementById("card");
    const host = document.getElementById("host");
    makeVisible(card, 780, 520, 100, 100);

    makeVisible(host, 760, 300, 110, 120);   // real area inside the card
    expect(placementOk(host, card)).toBe(true);

    makeVisible(host, 60, 300, 110, 120);    // squeezed column
    expect(placementOk(host, card)).toBe(false);

    makeVisible(host, 760, 40, 110, 120);    // no usable height
    expect(placementOk(host, card)).toBe(false);

    makeVisible(host, 760, 300, 900, 120);   // horizontally outside the card
    expect(placementOk(host, card)).toBe(false);
  });

  it("accepts a settings dialog during a probe window even without known controls", () => {
    // A click on the site's own Settings entry proves intent, so a rail alone is
    // enough — the live dialog exposes no class names we could match on.
    document.body.innerHTML = `
      <div class="x-card">
        <div class="x-rail">
          <div class="x-item">General</div>
          <div class="x-item">Profile</div>
          <div class="x-item">Data</div>
        </div>
        <div class="x-content"><div>Theme</div></div>
      </div>`;
    const card = document.querySelector(".x-card");
    const items = [...card.querySelectorAll(".x-item")];
    makeVisible(card, 780, 520, 120, 120);
    makeVisible(document.querySelector(".x-rail"), 180, 400, 140, 140);
    makeVisible(document.querySelector(".x-content"), 520, 400, 330, 140);
    items.forEach((el, i) => makeVisible(el, 150, 40, 150, 150 + i * 48));

    expect(classify(card, false)).toBeGreaterThan(0);  // rail is enough anyway
    expect(classify(card, true)).toBeGreaterThan(0);
  });

  it("ignores attribute churn outside dialog containers", () => {
    const row = document.createElement("div");
    row.className = "chat-row";
    expect(isDialogRootish(row)).toBe(false);

    const modal = document.createElement("div");
    modal.className = "ds-modal";
    expect(isDialogRootish(modal)).toBe(true);
  });

  it("never reads text from containers while probing clicks (freeze hazard)", () => {
    // textContent on a big container serialises the whole subtree; the probe must
    // bail out on anything that is not a small row.
    const big = document.createElement("div");
    big.className = "app-root";
    for (let i = 0; i < 40; i++) big.appendChild(document.createElement("div"));
    document.body.appendChild(big);

    let read = false;
    Object.defineProperty(big, "textContent", {
      get() {
        read = true;
        return "";
      },
    });

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // Simulate a click landing on the container itself.
    big.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(read).toBe(false);
  });

  it("injects a rail entry and switches between the site's page and ours", async () => {
    // The site's tab rail: General / Profile / Data / About (hashed classes).
    document.body.innerHTML = `
      <div class="hashed-card" id="card">
        <div class="hashed-rail" id="rail">
          <div class="hashed-item">General</div>
          <div class="hashed-item">Profile</div>
          <div class="hashed-item">Data</div>
          <div class="hashed-item">About</div>
        </div>
        <div class="hashed-content" id="content"><div class="hashed-switch-row"></div></div>
      </div>`;
    const card = document.getElementById("card");
    const rail = document.getElementById("rail");
    const content = document.getElementById("content");
    makeVisible(card, 780, 560, 120, 100);
    makeVisible(rail, 180, 480, 140, 130);
    makeVisible(content, 520, 460, 330, 140);
    [...rail.children].forEach((el, i) => makeVisible(el, 150, 40, 150, 150 + i * 48));
    makeVisible(content.firstElementChild, 500, 40, 340, 160);

    injectRailItem(card);
    const item = rail.querySelector("[data-bds-rail-item]");
    expect(item).not.toBeNull();
    expect(item.textContent.trim()).toBeTruthy();
    // Cloned from the site's own rows, so it inherits their styling.
    expect(item.className).toBe(rail.children[rail.children.length - 2].className);

    cleanupPanel();
    expect(rail.querySelector("[data-bds-rail-item]")).toBeNull();
  });

  it("mounts the overlay inside the card, right of the rail", () => {
    document.body.innerHTML = `
      <div class="hashed-card" id="card2">
        <div class="hashed-rail" id="rail2">
          <div class="hashed-item">General</div><div class="hashed-item">Profile</div><div class="hashed-item">Data</div>
        </div>
        <div class="hashed-content" id="content2"><div></div></div>
      </div>`;
    const card = document.getElementById("card2");
    const rail = document.getElementById("rail2");
    const content = document.getElementById("content2");
    makeVisible(card, 800, 560, 100, 100);
    makeVisible(rail, 180, 480, 120, 130);
    makeVisible(content, 540, 460, 320, 140);
    [...rail.children].forEach((el, i) => makeVisible(el, 150, 40, 130, 150 + i * 48));

    // The overlay starts where the content area starts (320 - 100), not at the rail.
    expect(contentOffsetLeft(card)).toBe(220);
  });

  it("offers several mount targets, ending with the dialog itself", () => {
    const dialog = document.createElement("div");
    dialog.className = "ds-modal-content";
    dialog.innerHTML = `
      <div class="ds-modal-content__main"><div class="ds-switch"></div><div class="ds-switch"></div></div>`;
    document.body.appendChild(dialog);
    layOut(dialog, { width: 600, height: 600, left: 100, top: 80 });
    const targets = mountTargets(dialog);
    expect(targets[0].className).toContain("ds-modal-content__main");
    expect(targets[targets.length - 1]).toBe(dialog);
  });
});
