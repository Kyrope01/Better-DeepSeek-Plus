// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { __nativeSettingsInternals } from "./native-settings.js";

const { classify, findNavRail, countControls, mountTargets } = __nativeSettingsInternals;

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
