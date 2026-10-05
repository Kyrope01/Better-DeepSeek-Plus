// @vitest-environment jsdom
/**
 * The panel that is injected into DeepSeek's own Settings dialog must be able to
 * mount. It was shipped once without its `appState` import, and because nothing
 * ever rendered the component the failure only appeared on the live site as
 * "[BDS:native-settings] mount failed: ReferenceError: appState is not defined".
 * Rendering it here is the cheapest possible guard against that class of bug.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({ pushConfigToPage: vi.fn() }));

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

import NativeSettingsPanel from "../../../src/content/ui/NativeSettingsPanel.svelte";
import appState from "../../../src/content/state.js";
import { resetAppState } from "../../helpers/app-state.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("NativeSettingsPanel", () => {
  beforeEach(() => {
    resetAppState({ ui: { showToast: vi.fn() } });
    document.body.innerHTML = "";
  });

  it("mounts without throwing and renders the extension header", async () => {
    const { target, cleanup } = renderSvelte(NativeSettingsPanel);
    await flushUi();

    expect(target.querySelector(".bds-ns-title")).not.toBeNull();
    // The full settings panel is mounted inside the host, not a partial copy.
    expect(target.querySelector("#bds-save-settings")).not.toBeNull();

    cleanup();
  });

  it("exposes the floating-button switch, off by default", async () => {
    const { target, cleanup } = renderSvelte(NativeSettingsPanel);
    await flushUi();

    const row = target.querySelector(".bds-ns-floating");
    expect(row).not.toBeNull();
    const input = row.querySelector('input[type="checkbox"]');
    expect(input.checked).toBe(false);

    cleanup();
  });

  it("pins the floating button through the shared settings store", async () => {
    const { target, cleanup } = renderSvelte(NativeSettingsPanel);
    await flushUi();

    const input = target.querySelector(".bds-ns-floating input[type='checkbox']");
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flushUi();

    expect(appState.settings.floatingButton).toBe("always");

    cleanup();
  });

  it("keeps the last mount error visible for diagnostics", async () => {
    const { __nativeSettingsInternals } = await import("../../../src/content/ui/native-settings.js");
    expect(typeof __nativeSettingsInternals.getLastMountError).toBe("function");
    const dump = __nativeSettingsInternals.diagnostics();
    expect(Array.isArray(dump.candidates)).toBe(true);
    expect("lastMountError" in dump).toBe(true);
  });

  it("renders the settings sections the drawer shows", async () => {
    const { target, cleanup } = renderSvelte(NativeSettingsPanel);
    await flushUi();

    const titles = [...target.querySelectorAll(".bds-section-title")].map((el) => el.textContent);
    // Section headers are drawn from the shared i18n messages; at least the
    // settings header must be there, which proves SettingsPanel rendered.
    expect(titles.length).toBeGreaterThan(0);

    cleanup();
  });
});
