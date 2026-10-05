// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  pushConfigToPage: vi.fn(),
}));

const projectManagerMocks = vi.hoisted(() => ({
  getActiveProject: vi.fn(() => null),
  updateProject: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  addProjectFilesBatch: vi.fn(),
  deleteProjectFile: vi.fn(),
  getFilesForProject: vi.fn(() => []),
  setActiveProject: vi.fn(),
  clearActiveProject: vi.fn(),
  tickFile: vi.fn(),
  untickFile: vi.fn(),
  clearActiveFiles: vi.fn(),
}));

const scannerMocks = vi.hoisted(() => ({
  scheduleScan: vi.fn(),
  collectMessageNodes: vi.fn(() => []),
  detectMessageRole: vi.fn(),
}));

const exporterMocks = vi.hoisted(() => ({
  exportSession: vi.fn(),
  collectMessages: vi.fn(() => []),
}));

const folderPickerMocks = vi.hoisted(() => ({
  pickFolderSelection: vi.fn(),
  pickFolderAndConcatenate: vi.fn(),
}));

vi.mock("../../../src/content/bridge.js", () => bridgeMocks);
vi.mock("../../../src/content/project-manager.js", () => projectManagerMocks);
vi.mock("../../../src/content/scanner.js", () => scannerMocks);
vi.mock("../../../src/content/tools/exporter.js", () => exporterMocks);
vi.mock("../../../src/lib/utils/folder-picker.js", () => folderPickerMocks);

import App from "../../../src/content/ui/App.svelte";
import appState from "../../../src/content/state.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

/** The extension's settings live in DeepSeek's own dialog; the floating button is
 *  opt-in. These tests cover both sides of that contract. */
describe("App floating button + drawer", () => {
  beforeEach(() => {
    resetAppState({ ui: { showToast: vi.fn() } });
    bridgeMocks.pushConfigToPage.mockReset();
    document.body.innerHTML = "";
  });

  it("does not render the floating button by default", async () => {
    const { target, cleanup } = renderSvelte(App);
    await flushUi();

    expect(target.querySelector("#bds-toggle")).toBeNull();

    cleanup();
  });

  it("renders the pinned button with its labels when floatingButton === 'always'", async () => {
    appState.settings.floatingButton = "always";

    const { target, cleanup } = renderSvelte(App);
    await flushUi();

    const toggle = target.querySelector("#bds-toggle");
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-label")).toBe("Better DeepSeek");

    const fullSpan = target.querySelector("#bds-toggle .bds-toggle-full");
    expect(fullSpan).not.toBeNull();
    expect(fullSpan.textContent).toBe("BDS");
    expect(fullSpan.getAttribute("aria-hidden")).toBe("true");

    const shortSpan = target.querySelector("#bds-toggle .bds-toggle-short");
    expect(shortSpan).not.toBeNull();
    expect(shortSpan.textContent).toBe("B");
    expect(shortSpan.getAttribute("aria-hidden")).toBe("true");

    cleanup();
  });

  it("pins the button when the settings panel asks for it", async () => {
    const { target, cleanup } = renderSvelte(App);
    await flushUi();
    expect(target.querySelector("#bds-toggle")).toBeNull();

    window.dispatchEvent(new CustomEvent("bds:floating-button-changed", { detail: true }));
    await flushUi();

    expect(target.querySelector("#bds-toggle")).not.toBeNull();

    cleanup();
  });

  it("pinned button opens the drawer", async () => {
    appState.settings.floatingButton = "always";

    const { target, cleanup } = renderSvelte(App);
    await flushUi();

    const drawer = target.querySelector("#bds-drawer");
    expect(drawer.className).toContain("bds-closed");

    target.querySelector("#bds-toggle").click();
    await flushUi();

    expect(drawer.className).toContain("bds-open");
    expect(drawer.className).not.toContain("bds-closed");

    cleanup();
  });

  it("pinned button toggles the drawer closed again", async () => {
    appState.settings.floatingButton = "always";

    const { target, cleanup } = renderSvelte(App);
    await flushUi();

    const toggle = target.querySelector("#bds-toggle");
    const drawer = target.querySelector("#bds-drawer");

    toggle.click();
    await flushUi();
    expect(drawer.className).toContain("bds-open");

    toggle.click();
    await flushUi();
    expect(drawer.className).toContain("bds-closed");

    cleanup();
  });

  it("close button inside drawer closes it", async () => {
    appState.settings.floatingButton = "always";

    const { target, cleanup } = renderSvelte(App);
    await flushUi();

    target.querySelector("#bds-toggle").click();
    await flushUi();
    expect(target.querySelector("#bds-drawer").className).toContain("bds-open");

    target.querySelector("#bds-close").click();
    await flushUi();
    expect(target.querySelector("#bds-drawer").className).toContain("bds-closed");

    cleanup();
  });
});
