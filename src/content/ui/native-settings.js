/**
 * DeepSeek-native settings bridge.
 *
 * Better DeepSeek's settings are also rendered *inside chat.deepseek.com's own
 * Settings dialog*, so users never have to know the extension ships a drawer.
 *
 * The site's dialog markup is React-rendered with hashed CSS-module classes, so
 * this module classifies dialogs **structurally** instead of by class hash or by
 * locale-dependent text:
 *
 *   • the container is a modal-ish node (`.ds-modal-content`, `.ds-modal`,
 *     `[role="dialog"]`, or a class containing "modal");
 *   • it is a settings surface when it holds at least two form controls
 *     (switch/checkbox/radio group/select/number input) and either a tab strip,
 *     a scrollable content pane, or a tall dialog;
 *   • it is skipped when it matches the share dialog signature (primary footer
 *     action + textarea), which the extension already decorates elsewhere.
 *
 * Injection is additive and reversible: one marked host element is appended to
 * the dialog's scroll pane and the Svelte panel is mounted into it; a keep-alive
 * pass re-appends it if React drops it, and it is unmounted when the dialog
 * closes. The drawer (and its markup contract) is untouched.
 */

import { mount, unmount } from "svelte";
import NativeSettingsPanel from "./NativeSettingsPanel.svelte";

const HOST_ATTR = "data-bds-native-settings";
const DIALOG_ATTR = "data-bds-settings-dialog";
const CHECK_INTERVAL_MS = 800;

// Form-control signatures of the site's settings screens. Structural, so they
// hold in every locale and survive class-hash churn.
const CONTROL_SELECTOR = [
  ".ds-switch",
  '[role="switch"]',
  ".ds-checkbox",
  ".ds-radio-button-group",
  ".ds-segmented",
  ".ds-native-select",
  "select",
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="number"]',
].join(",");

const TAB_SELECTOR = [".ds-tabs", ".ds-tab", '[role="tablist"]', '[role="tab"]', ".ds-sider"].join(",");

const DIALOG_SELECTOR = [
  ".ds-modal-content",
  ".ds-modal",
  '[role="dialog"]',
  '[class*="modal" i]',
].join(",");

let observer = null;
let interval = null;
let hostEl = null;
let panelInstance = null;
let currentDialog = null;
let tPrev = null;

/** Visible = attached, non-zero box, not display:none/visibility:hidden. */
function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

function isOurNode(el) {
  return !!el.closest("#bds-root") || !!el.closest(`[${HOST_ATTR}]`);
}

/** First scrollable descendant of the dialog (the settings content pane). */
function findScrollPane(dialog) {
  const preferred = dialog.querySelector(".ds-modal-content__main");
  if (preferred) return preferred;

  const children = dialog.querySelectorAll("div");
  for (const child of children) {
    const style = window.getComputedStyle(child);
    const overflowY = style.overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && child.scrollHeight > child.clientHeight) {
      return child;
    }
  }

  // Fall back to the dialog's own body — still inside the scroll container.
  return dialog;
}

/** Score a candidate dialog; returns null when it is not a settings surface. */
function classify(dialog) {
  if (!isVisible(dialog) || isOurNode(dialog) || dialog.hasAttribute(DIALOG_ATTR)) return null;

  const controls = dialog.querySelectorAll(CONTROL_SELECTOR).length;
  if (controls < 2) return null;

  const hasTabs = !!dialog.querySelector(TAB_SELECTOR);
  const scrollPane = findScrollPane(dialog);
  const scrollable = scrollPane !== dialog || scrollPane.scrollHeight > scrollPane.clientHeight + 4;
  const rect = dialog.getBoundingClientRect();
  const tall = rect.height > window.innerHeight * 0.45;

  // Share dialog (already handled by share-dialog-injector) and other one-shot
  // confirm surfaces: primary footer action next to a textarea.
  const shareLike =
    !!dialog.querySelector(".ds-modal-content__footer .ds-button--primary, [class*='footer' i] [class*='primary' i]") &&
    !!dialog.querySelector("textarea");

  if (shareLike) return null;

  if (!hasTabs && !scrollable && !tall) return null;

  return controls + (hasTabs ? 3 : 0) + (scrollable ? 2 : 0) + (tall ? 1 : 0);
}

function mountPanel(dialog) {
  if (hostEl && hostEl.isConnected && currentDialog === dialog) return;

  cleanupPanel();

  currentDialog = dialog;
  dialog.setAttribute(DIALOG_ATTR, "1");

  hostEl = document.createElement("div");
  hostEl.className = "bds-native-settings-host";
  hostEl.setAttribute(HOST_ATTR, "1");

  const pane = findScrollPane(dialog);
  pane.appendChild(hostEl);

  try {
    panelInstance = mount(NativeSettingsPanel, { target: hostEl });
    // A second copy of the settings panel lives in this dialog, so `id`s in it can
    // duplicate the drawer's. Re-point this copy's <label for> targets at its own
    // controls so clicking a label never focuses the other surface's input.
    scopeLabelTargets(hostEl);
  } catch (err) {
    console.warn("[BDS:native-settings] mount failed:", err);
    hostEl.remove();
    hostEl = null;
    panelInstance = null;
  }
}


/** Keep this copy's labels pointing at this copy's controls (see mountPanel). */
function scopeLabelTargets(root) {
  for (const label of root.querySelectorAll("label[for]")) {
    const id = label.getAttribute("for");
    if (!id) continue;
    label.removeAttribute("for");
    label.addEventListener("click", (event) => {
      const target = root.querySelector("#" + CSS.escape(id));
      if (!target) return;
      event.preventDefault();
      target.focus?.();
      if (target.type === "checkbox" || target.type === "radio") target.click();
    });
  }
}

function cleanupPanel() {
  if (panelInstance) {
    try {
      unmount(panelInstance);
    } catch (_) {
      // already gone
    }
    panelInstance = null;
  }
  if (hostEl) {
    hostEl.remove();
    hostEl = null;
  }
  if (currentDialog) {
    currentDialog.removeAttribute(DIALOG_ATTR);
    currentDialog = null;
  }
}

/** One detection pass: mount into the best settings dialog, or clean up. */
function scan() {
  if (!document.body) return;

  // Already mounted and the dialog is still alive → nothing to do.
  if (hostEl && hostEl.isConnected && currentDialog && currentDialog.isConnected && isVisible(currentDialog)) {
    return;
  }

  // Stale instance (dialog closed or React removed our node).
  if (hostEl && (!hostEl.isConnected || !currentDialog || !currentDialog.isConnected)) {
    cleanupPanel();
  }

  let best = null;
  let bestScore = 0;
  const candidates = document.querySelectorAll(DIALOG_SELECTOR);

  for (const candidate of candidates) {
    const score = classify(candidate);
    if (score !== null && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (best) {
    mountPanel(best);
  }
}

/**
 * Start watching for DeepSeek's Settings dialog.
 * Safe to call once from the content-script bootstrap.
 */
export function initNativeSettings() {
  if (observer) return;

  scan();

  observer = new MutationObserver(() => {
    // Cheap guard: only re-scan when a modal-ish node was added/removed.
    scan();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  interval = setInterval(() => {
    if (!document.body) return;
    scan();
  }, CHECK_INTERVAL_MS);

  // Keep the panel alive across route changes.
  window.addEventListener("popstate", scan);
  window.addEventListener("bds:settingsChanged", scan);
}

/** Stop watching and remove the injected panel. */
export function destroyNativeSettings() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  window.removeEventListener("popstate", scan);
  window.removeEventListener("bds:settingsChanged", scan);
  cleanupPanel();
}

/**
 * Best-effort locator for the site's Settings entry.
 *
 * The account menu (avatar, bottom-left of the sidebar) is rendered with hashed
 * classes, so the entry is found by its visible wording, constrained to menu
 * items inside the sidebar/dropdown area. When no menu is open yet, the avatar
 * button is clicked first and the lookup is retried once.
 */
const SETTINGS_LABELS = ["Settings", "设置", "Настройки", "Ayarlar", "تنظیمات"];

function looksLikeSettingsItem(node) {
  if (isOurNode(node) || !isVisible(node)) return false;
  const text = (node.textContent || "").trim();
  if (!text || text.length > 40) return false;
  return SETTINGS_LABELS.some((label) => text === label || text.includes(label));
}

function inSidebarOrMenu(node) {
  const menu = node.closest('.ds-dropdown-menu, [role="menu"], [role="dialog"]');
  if (menu) return true;
  const rect = node.getBoundingClientRect();
  return rect.left < Math.min(420, window.innerWidth * 0.4);
}

function findSettingsItem() {
  const nodes = document.querySelectorAll(
    '.ds-dropdown-menu-option, [role="menuitem"], [role="option"], button, [role="button"]'
  );
  for (const node of nodes) {
    if (looksLikeSettingsItem(node) && inSidebarOrMenu(node)) return node;
  }
  return null;
}

function findAccountButton() {
  const nodes = document.querySelectorAll('button, [role="button"], [class*="avatar" i]');
  for (const node of nodes) {
    if (isOurNode(node) || !isVisible(node)) continue;
    if (node.querySelector("img")) {
      const rect = node.getBoundingClientRect();
      if (rect.left < Math.min(360, window.innerWidth * 0.35) && rect.top > window.innerHeight * 0.5) {
        return node;
      }
    }
  }
  return null;
}

/**
 * Opens the page's own Settings dialog when possible (used by the drawer link).
 * @returns {boolean} true when a native entry was found and clicked
 */
export function openNativeSettings() {
  const direct = findSettingsItem();
  if (direct) {
    direct.click();
    return true;
  }

  const account = findAccountButton();
  if (!account) return false;

  account.click();
  setTimeout(() => {
    const item = findSettingsItem();
    if (item) item.click();
  }, 180);
  return true;
}

// Re-export for tests / debugging.
export const __nativeSettingsInternals = { classify, findScrollPane, scan, HOST_ATTR };
