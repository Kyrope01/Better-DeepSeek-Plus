/**
 * DeepSeek-native settings bridge.
 *
 * Better DeepSeek's settings are also rendered *inside chat.deepseek.com's own
 * Settings dialog*, so users never have to know the extension ships a drawer.
 *
 * The site's dialog markup is React-rendered with hashed CSS-module classes, and
 * it changes between releases, so a dialog is recognised by **shape**, never by a
 * class hash or by locale-dependent text:
 *
 *   • a visible modal-ish container (`.ds-modal-content`, `.ds-modal`,
 *     `[role="dialog"]`, any class containing "modal"), and
 *   • either a navigation rail — at least three similar rows stacked in the left
 *     half of the dialog (General / Profile / Data / About … their class names are
 *     unknown, so the rows are found geometrically), or two form controls; and
 *   • nothing that marks it as the share dialog (primary footer action + textarea).
 *
 * The panel is then tried in several containers inside the dialog and the first
 * placement that actually lays out is kept, so a hidden tab pane or an
 * `overflow: hidden` wrapper can no longer swallow it.
 *
 * Injection is additive and reversible: one marked host element holds the Svelte
 * panel, a keep-alive pass re-appends it if React drops it, and it is unmounted
 * when the dialog closes. The drawer (and its markup contract) is untouched.
 *
 * Debugging: while a dialog-shaped surface is open but unrecognised, a one-line
 * notice is logged; `__BDS_DIAG__.dump()` returns the full picture of every
 * candidate (size, controls, rail, class names and text) for bug reports.
 */

import { mount, unmount } from "svelte";
import NativeSettingsPanel from "./NativeSettingsPanel.svelte";

const HOST_ATTR = "data-bds-native-settings";
const DIALOG_ATTR = "data-bds-settings-dialog";
// Deliberately distinct from HOST_ATTR: this one lands on <html>, and if it shared
// the host marker's name then isOurNode() would match every element on the page.
const PAGE_ATTR = "data-bds-native-settings-ready";
const CHECK_INTERVAL_MS = 800;

// Form controls the site uses in settings screens. The first group are real
// elements; the class-name scan below catches markup variants we have not met.
const CONTROL_SELECTOR = [
  ".ds-switch",
  '[role="switch"]',
  ".ds-checkbox",
  'input[type="checkbox"]',
  '[role="checkbox"]',
  ".ds-radio-button-group",
  '[role="radiogroup"]',
  'input[type="radio"]',
  ".ds-segmented",
  ".ds-native-select",
  ".ds-select",
  "select",
  '[role="combobox"]',
  'input[type="number"]',
  'input[type="range"]',
  ".ds-slider",
].join(",");

const CONTROL_CLASS_RE = /(switch|checkbox|radio|segmented|select|slider|slid)/i;
const NAV_CLASS_RE = /(tab|sider|nav|menu-option)/i;

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
/** Once the panel has been shown in this page session the button stays hidden. */
let everMounted = false;
const warnedCandidates = new WeakSet();

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

function classNameOf(el) {
  return typeof el.className === "string" ? el.className : el.getAttribute?.("class") || "";
}

/* ── shape detection ─────────────────────────────────────────────────────── */

/** Direct hits first, then a class-name scan for markup variants. */
function countControls(dialog) {
  const direct = dialog.querySelectorAll(CONTROL_SELECTOR).length;
  if (direct >= 2) return direct;

  let loose = 0;
  for (const el of dialog.querySelectorAll("[class]")) {
    if (CONTROL_CLASS_RE.test(classNameOf(el))) loose++;
    if (loose > 40) break;
  }
  return Math.max(direct, Math.min(loose, 30));
}

function rowsOf(el) {
  return el ? el.querySelectorAll('button, a, li, [role="tab"], div').length : 0;
}

/**
 * The dialog's left rail (General / Profile / Data / About …).
 *
 * Looked for by role/class first, then geometrically: rows in the left half of
 * the dialog that share a column signature and stack at least three deep.
 */
function findNavRail(dialog) {
  const explicit = dialog.querySelector('.ds-tabs, .ds-sider, [role="tablist"], nav');
  if (explicit && rowsOf(explicit) >= 3) return explicit;

  const dialogRect = dialog.getBoundingClientRect();
  const rows = [];
  for (const el of dialog.querySelectorAll("button, a, li, div")) {
    if (isOurNode(el) || !isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 18 || rect.height > 72) continue;
    if (rect.left > dialogRect.left + dialogRect.width * 0.55) continue;
    const text = (el.textContent || "").trim();
    if (!text || text.length > 32 || el.children.length > 3) continue;
    rows.push({ el, rect });
  }

  const groups = new Map();
  for (const row of rows) {
    const key = `${Math.round(row.rect.left / 8)}:${Math.round(row.rect.width / 16)}`;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  let best = null;
  for (const list of groups.values()) {
    if (list.length >= 3 && (!best || list.length > best.length)) best = list;
  }
  if (!best) return null;

  let node = best[0].el.parentElement;
  while (node && node !== dialog && !best.every(({ el }) => node.contains(el))) {
    node = node.parentElement;
  }
  return node && node !== dialog ? node : null;
}

/** The share dialog already has its own injector — never hijack it. */
function isShareLike(dialog) {
  return (
    !!dialog.querySelector(
      ".ds-modal-content__footer .ds-button--primary, [class*='footer' i] [class*='primary' i]"
    ) && !!dialog.querySelector("textarea")
  );
}

/** Score a candidate dialog; returns null when it is not a settings surface. */
function classify(dialog) {
  if (!isVisible(dialog) || isOurNode(dialog) || dialog.hasAttribute(DIALOG_ATTR)) return null;
  if (isShareLike(dialog)) return null;

  const controls = countControls(dialog);
  const rail = findNavRail(dialog);
  const navish = !!rail && rowsOf(rail) >= 3;

  if (!navish && controls < 2) return null;

  const rect = dialog.getBoundingClientRect();
  const tall = rect.height > window.innerHeight * 0.4;
  const wide = rect.width > window.innerWidth * 0.3;
  if (!navish && !tall) return null;

  return (navish ? 6 : 0) + Math.min(controls, 8) * 2 + (tall ? 2 : 0) + (wide ? 1 : 0);
}

/* ── mounting ────────────────────────────────────────────────────────────── */

/** Real scroll containers inside the dialog, deepest last. */
function scrollersIn(dialog) {
  const found = [];
  for (const el of dialog.querySelectorAll("div")) {
    const style = window.getComputedStyle(el);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 4
    ) {
      found.push(el);
    }
  }
  return found;
}

/** The column that holds the dialog's controls (content area, right of the rail). */
function controlColumn(dialog) {
  const controls = dialog.querySelectorAll(CONTROL_SELECTOR);
  if (!controls.length) return null;
  let node = controls[controls.length - 1];
  while (node && node.parentElement && node.parentElement !== dialog) node = node.parentElement;
  return node && node !== dialog ? node : null;
}

/** Containers to try, best first. */
function mountTargets(dialog) {
  const targets = [];
  const push = (el) => {
    if (el && el.isConnected && !targets.includes(el)) targets.push(el);
  };

  push(dialog.querySelector(".ds-modal-content__main"));
  for (const el of scrollersIn(dialog).slice(-3).reverse()) push(el);
  push(controlColumn(dialog));
  push(dialog);
  return targets;
}

/** Flag the page so the floating button can step aside (CSS reads this). */
function markPage(active) {
  if (active) {
    everMounted = true;
    document.documentElement.setAttribute(PAGE_ATTR, "available");
    return;
  }
  if (!everMounted) document.documentElement.removeAttribute(PAGE_ATTR);
}

/**
 * Keep this copy's labels pointing at this copy's controls: the drawer mounts a
 * second SettingsPanel, so `id`s can be duplicated between the two.
 */
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

function mountPanel(dialog) {
  if (hostEl && hostEl.isConnected && currentDialog === dialog) return;

  cleanupPanel();

  for (const target of mountTargets(dialog)) {
    const host = document.createElement("div");
    host.className = "bds-native-settings-host";
    host.setAttribute(HOST_ATTR, "1");
    target.appendChild(host);

    let instance = null;
    try {
      instance = mount(NativeSettingsPanel, { target: host });
      scopeLabelTargets(host);
    } catch (err) {
      console.warn("[BDS:native-settings] mount failed:", err);
      host.remove();
      continue;
    }

    // A placement that does not lay out (hidden tab pane, clipped wrapper) is
    // useless — try the next container instead of leaving an invisible panel.
    const rect = host.getBoundingClientRect();
    if (rect.height >= 24 && rect.width >= 40) {
      currentDialog = dialog;
      dialog.setAttribute(DIALOG_ATTR, "1");
      hostEl = host;
      panelInstance = instance;
      markPage(true);
      return;
    }

    try {
      unmount(instance);
    } catch (_) {
      // already gone
    }
    host.remove();
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
  markPage(false);
}

/* ── scanning ────────────────────────────────────────────────────────────── */

function candidates() {
  const list = [];
  for (const el of document.querySelectorAll(DIALOG_SELECTOR)) {
    if (isOurNode(el) || !isVisible(el)) continue;
    list.push(el);
  }
  return list;
}

/** One detection pass: mount into the best settings dialog, or clean up. */
function scan() {
  if (!document.body) return;

  // Already mounted and the dialog is still alive → nothing to do.
  if (
    hostEl &&
    hostEl.isConnected &&
    currentDialog &&
    currentDialog.isConnected &&
    isVisible(currentDialog)
  ) {
    return;
  }

  // Stale instance (dialog closed or React removed our node).
  if (hostEl && (!hostEl.isConnected || !currentDialog || !currentDialog.isConnected)) {
    cleanupPanel();
  }

  let best = null;
  let bestScore = 0;
  for (const candidate of candidates()) {
    const score = classify(candidate);
    if (score !== null && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (best) {
    mountPanel(best);
    return;
  }

  // Nothing matched: if a modal-looking surface is open, say so once per surface
  // so the user can send us the shape instead of guessing.
  for (const candidate of candidates()) {
    if (warnedCandidates.has(candidate)) continue;
    warnedCandidates.add(candidate);
    console.info(
      "[BDS:native-settings] a dialog is open but was not recognised as Settings. " +
        "Run __BDS_DIAG__.dump() and share the output to improve detection.",
      summarize(candidate)
    );
  }
}

/* ── diagnostics ─────────────────────────────────────────────────────────── */

function summarize(el) {
  const rect = el.getBoundingClientRect();
  const rail = findNavRail(el);
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    role: el.getAttribute("role") || undefined,
    class: classNameOf(el).slice(0, 200) || undefined,
    size: [Math.round(rect.width), Math.round(rect.height)],
    controls: el.querySelectorAll(CONTROL_SELECTOR).length,
    rail: rail ? { size: rowsOf(rail), class: classNameOf(rail).slice(0, 120) } : null,
    text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
    children: [...el.children].slice(0, 8).map((child) => {
      const cls = classNameOf(child).split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      return child.tagName.toLowerCase() + (cls ? "." + cls : "");
    }),
  };
}

function diagnostics() {
  return {
    url: location.href,
    theme:
      document.body?.getAttribute("data-ds-dark-theme") !== null &&
      document.body?.hasAttribute("data-ds-dark-theme")
        ? "dark"
        : "light",
    mounted: hostEl
      ? { connected: hostEl.isConnected, size: (() => { const r = hostEl.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() }
      : null,
    dialogs: candidates().map((el) => ({
      ...summarize(el),
      recognised: classify(el) !== null,
    })),
  };
}

/* ── public API ──────────────────────────────────────────────────────────── */

/**
 * Start watching for DeepSeek's Settings dialog.
 * Safe to call once from the content-script bootstrap.
 */
export function initNativeSettings() {
  if (observer) return;

  observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  interval = setInterval(scan, CHECK_INTERVAL_MS);
  scan();

  // Console helpers for the user and for bug reports.
  try {
    window.__BDS_DIAG__ = {
      dump: diagnostics,
      scan,
      get mounted() {
        return !!hostEl;
      },
    };
  } catch (_) {
    // non-window context
  }
}

export function destroyNativeSettings() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  cleanupPanel();
  try {
    delete window.__BDS_DIAG__;
  } catch (_) {
    // ignore
  }
}

/* ── opening the site's own settings ─────────────────────────────────────── */

const SETTINGS_LABELS = ["Settings", "设置", "Настройки", "Ayarlar", "تنظیمات"];

/** Our own injected rows must never be mistaken for the site's Settings entry. */
function isBdsInjected(node) {
  const cls = classNameOf(node);
  return /(^|\s)bds-/.test(cls);
}

function looksLikeSettingsItem(node) {
  if (isOurNode(node) || isBdsInjected(node) || !isVisible(node)) return false;
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
 * Opens the page's own Settings dialog when possible.
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
export const __nativeSettingsInternals = {
  classify,
  findNavRail,
  countControls,
  mountTargets,
  summarize,
  diagnostics,
  scan,
  HOST_ATTR,
  PAGE_ATTR,
};
