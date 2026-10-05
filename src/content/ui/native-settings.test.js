// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { __nativeSettingsInternals } from "./native-settings.js";

const { classify, findScrollPane } = __nativeSettingsInternals;

/** jsdom reports zero-size boxes; make a node look like a real dialog. */
function makeVisible(el, width = 620, height = 700) {
  el.getBoundingClientRect = () => ({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0,
    toJSON() { return {}; },
  });
  return el;
}

function build(html) {
  document.body.innerHTML = html;
  const dialog = document.querySelector("[data-test-dialog]");
  makeVisible(dialog);
  for (const child of dialog.querySelectorAll("*")) makeVisible(child, 600, 500);
  return dialog;
}

describe("native settings dialog classification", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.removeAttribute("data-ds-dark-theme");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("accepts a settings-shaped dialog (controls + tabs + scroll pane)", () => {
    const dialog = build(`
      <div class="ds-modal-content" data-test-dialog>
        <div class="ds-modal-content__header-wrapper"><div class="ds-modal-content__title">Settings</div></div>
        <div class="ds-tabs"><div class="ds-tab ds-tab--active">General</div></div>
        <div class="ds-modal-content__main">
          <div class="ds-switch"></div>
          <div class="ds-switch ds-switch--checked"></div>
          <div class="ds-native-select"></div>
        </div>
      </div>
    `);
    const score = classify(dialog);
    expect(score).toBeGreaterThan(0);
    expect(findScrollPane(dialog)).toBe(dialog.querySelector(".ds-modal-content__main"));
  });

  it("rejects surfaces with fewer than two form controls", () => {
    const dialog = build(`
      <div class="ds-modal-content" data-test-dialog>
        <div class="ds-modal-content__title">Rename chat</div>
        <div class="ds-modal-content__main"><input type="text" /></div>
      </div>
    `);
    expect(classify(dialog)).toBeNull();
  });

  it("rejects the share dialog signature (primary footer action + textarea)", () => {
    const dialog = build(`
      <div class="ds-modal-content ds-modal-content--dialog" data-test-dialog>
        <div class="ds-modal-content__main">
          <textarea></textarea>
          <div class="ds-switch"></div>
          <div class="ds-switch"></div>
        </div>
        <div class="ds-modal-content__footer"><button class="ds-button ds-button--primary">Share</button></div>
      </div>
    `);
    expect(classify(dialog)).toBeNull();
  });

  it("never treats our own UI as a settings dialog", () => {
    const dialog = build(`
      <div id="bds-root"><div data-bds-native-settings="1">
        <div class="ds-modal-content" data-test-dialog>
          <div class="ds-switch"></div><div class="ds-switch"></div>
          <div class="ds-tabs"></div>
        </div>
      </div></div>
    `);
    expect(classify(dialog)).toBeNull();
  });

  it("prefers the site's own scroll pane over the dialog root", () => {
    const dialog = build(`
      <div class="ds-modal-content" data-test-dialog>
        <div class="ds-switch"></div><div class="ds-switch"></div>
        <div class="ds-modal-content__main"><div>rows</div></div>
      </div>
    `);
    const pane = findScrollPane(dialog);
    expect(pane.className).toContain("ds-modal-content__main");
  });
});
