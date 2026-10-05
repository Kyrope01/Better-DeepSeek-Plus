/**
 * DeepSeek-native settings bridge.
 *
 * Better DeepSeek's settings are rendered *inside chat.deepseek.com's own Settings
 * dialog*, so the extension has no settings UI of its own to find.
 *
 * ── Why this module is careful about performance ──────────────────────────────
 * The dialog is React-rendered with hashed class names that change between
 * releases, so it is recognised by **shape**, never by a class hash or by
 * locale-dependent text. That means DOM inspection — and DOM inspection on a live
 * chat page is expensive: every `getBoundingClientRect()`/`getComputedStyle()`
 * forces layout, and React mutates attributes and nodes continuously (token
 * streaming, animations, virtual lists). An earlier revision observed *every*
 * attribute change and re-scanned the document on each one; on a real account
 * that pinned the main thread and froze the page.
 *
 * The rules that keep this cheap, and must stay in place:
 *   • observe `childList` only — never `attributes`;
 *   • only look at added/removed elements that plausibly contain a dialog;
 *   • debounce scans (150 ms) and rate-limit them (≥500 ms apart);
 *   • cheap selectors first, the expensive `[class*="modal" i]` sweep only as a
 *     fallback and at most once a second;
 *   • bound every DOM walk (MAX_NODES) instead of iterating a whole dialog;
 *   • cache per-dialog classification/nav-rail (WeakMap) and mount attempts;
 *   • never mount more than a couple of times per dialog, with backoff;
 *   • do nothing at all while the tab is hidden.
 *
 * Injection is additive and reversible: one marked host element holds the Svelte
 * panel, a heartbeat re-appends it if React drops it, and it is unmounted when the
 * dialog closes. The drawer (and its markup contract) is untouched.
 *
 * Debugging: `__BDS_DIAG__.dump()` returns every candidate's size, controls, rail,
 * classes and text, plus mount-attempt state.
 */

import { mount, unmount } from "svelte";
import NativeSettingsPanel from "./NativeSettingsPanel.svelte";

const HOST_ATTR = "data-bds-native-settings";
/** Set on <html> once the panel has been shown; diagnostics only. */
const PAGE_ATTR = "data-bds-native-settings-ready";
const DIALOG_ATTR = "data-bds-settings-dialog";

const SCAN_DEBOUNCE_MS = 150;
const SCAN_MIN_INTERVAL_MS = 500;
const HEARTBEAT_MS = 1500;
/** Fallback full-document sweep interval when no dialog markup is present yet. */
const SWEEP_HEARTBEAT_MS = 5000;
/** Ceiling for every DOM walk — cost stays constant on huge dialogs. */
const MAX_NODES = 600;
/** Mount attempts allowed per dialog before it is left alone (with backoff). */
const MAX_ATTEMPTS_PER_DIALOG = 4;

/** Cheap "could this be a dialog?" hint used to filter mutations and the heartbeat. */
const MODAL_HINT = '.ds-modal-content, .ds-modal, [role="dialog"], [class*="modal" i]';

/** Form controls the site uses in settings screens (real elements first). */
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

/** The two most reliable dialog selectors; the class sweep is the fallback. */
const DIALOG_SELECTOR_FAST = ".ds-modal-content, .ds-modal, [role=\"dialog\"]";

let observer = null;
let heartbeat = null;
let hostEl = null;
let panelInstance = null;
let currentDialog = null;

/** Once the panel has been shown in this page session the flag stays set. */
let everMounted = false;

let scanTimer = null;
let scanQueued = false;
let lastScanAt = 0;
let lastSweepAt = 0;
let lastSweepHeartbeatAt = 0;
let scanning = false;

const warnedCandidates = new WeakSet();
/** Per-dialog: { attempts, lastAttemptAt, klass, rail, klassAt } */
const dialogState = new WeakMap();

/* ── small helpers ───────────────────────────────────────────────────────── */

function stateOf(el) {
  let s = dialogState.get(el);
  if (!s) {
    s = { attempts: 0, lastAttemptAt: 0, klass: null, klassAt: 0, rail: null, railAt: 0 };
    dialogState.set(el, s);
  }
  return s;
}

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

/** Cheap structural pre-filter: is this element (or its subtree) dialog-shaped? */
function looksModalish(node) {
  if (!node || node.nodeType !== 1) return false;
  if (node.matches?.(MODAL_HINT)) return true;
  // A fresh dialog arrives as a small wrapper; only pay for the subtree query when
  // the added subtree is small enough to be a wrapper rather than a whole list.
  return node.childElementCount > 0 && node.childElementCount < 400 && !!node.querySelector?.(MODAL_HINT);
}

/**
 * Attribute changes we care about are class/style flips on a dialog container
 * itself (React showing a modal it had already rendered). React also mutates
 * attributes constantly elsewhere — those must not reach the scanner, which is
 * why the observer carries an attributeFilter and this predicate is pure string
 * work with no layout reads.
 */
function isDialogRootish(el) {
  return !!el && el.nodeType === 1 && !!el.matches?.(MODAL_HINT);
}

/* ── shape detection ─────────────────────────────────────────────────────── */

/** Direct hits first, then a bounded class-name scan for markup variants. */
function countControls(dialog) {
  const direct = dialog.querySelectorAll(CONTROL_SELECTOR).length;
  if (direct >= 2) return direct;

  let loose = 0;
  let seen = 0;
  for (const el of dialog.querySelectorAll("[class]")) {
    if (++seen > MAX_NODES) break;
    if (CONTROL_CLASS_RE.test(classNameOf(el))) loose++;
    if (loose > 20) break;
  }
  return Math.max(direct, loose);
}

function rowsOf(el) {
  return el ? Math.min(el.querySelectorAll('button, a, li, [role="tab"], div').length, MAX_NODES) : 0;
}

/**
 * The dialog's navigation rail (General / Profile / Data / About …).
 *
 * Role/class hints first, then geometry: rows in the left half of the dialog that
 * share a column signature and stack at least three deep. Bounded by MAX_NODES
 * and cached per dialog for a second, because this walk is the expensive part.
 */
function findNavRail(dialog) {
  const cached = stateOf(dialog);
  const now = Date.now();
  if (cached.rail !== null && now - cached.railAt < 1000) return cached.rail;

  const remember = (value) => {
    cached.rail = value;
    cached.railAt = now;
    return value;
  };

  const explicit = dialog.querySelector('.ds-tabs, .ds-sider, [role="tablist"], nav');
  if (explicit && rowsOf(explicit) >= 3) return remember(explicit);

  const dialogRect = dialog.getBoundingClientRect();
  const leftLimit = dialogRect.left + dialogRect.width * 0.55;
  const groups = new Map();
  let best = null;
  let seen = 0;

  // Single pass with an early exit: geometry reads force layout, so the walk stops
  // as soon as one column has three stacked rows — the rail is then in hand.
  for (const el of dialog.querySelectorAll("button, a, li, div")) {
    if (++seen > MAX_NODES) break;
    if (isOurNode(el) || el.children.length > 3) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 18 || rect.height > 72) continue;
    if (rect.left > leftLimit) continue;
    const text = (el.textContent || "").trim();
    if (!text || text.length > 32) continue;

    const key = `${Math.round(rect.left / 8)}:${Math.round(rect.width / 16)}`;
    const list = groups.get(key) || [];
    list.push({ el, rect });
    groups.set(key, list);

    if (list.length >= 3 && (!best || list.length > best.length)) {
      best = list;
      break;
    }
  }

  if (!best) return remember(null);

  let node = best[0].el.parentElement;
  while (node && node !== dialog && !best.every(({ el }) => node.contains(el))) {
    node = node.parentElement;
  }
  return remember(node && node !== dialog ? node : null);
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
  if (isOurNode(dialog) || dialog.hasAttribute(DIALOG_ATTR)) return null;

  const state = stateOf(dialog);
  const now = Date.now();
  if (state.klass !== null && now - state.klassAt < 1000) return state.klass;

  const remember = (value) => {
    state.klass = value;
    state.klassAt = now;
    return value;
  };

  if (!isVisible(dialog) || isShareLike(dialog)) return remember(null);

  const controls = countControls(dialog);
  const navish = rowsOf(findNavRail(dialog)) >= 3;

  if (!navish && controls < 2) return remember(null);

  const rect = dialog.getBoundingClientRect();
  const tall = rect.height > window.innerHeight * 0.4;
  if (!navish && !tall) return remember(null);

  const wide = rect.width > window.innerWidth * 0.3;
  return remember((navish ? 6 : 0) + Math.min(controls, 8) * 2 + (tall ? 2 : 0) + (wide ? 1 : 0));
}

/* ── mounting ────────────────────────────────────────────────────────────── */

/** Real scroll containers inside the dialog, deepest last (bounded). */
function scrollersIn(dialog) {
  const found = [];
  let seen = 0;
  for (const el of dialog.querySelectorAll("div")) {
    if (++seen > MAX_NODES) break;
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

/** The column that holds the dialog's controls (the content area). */
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
  for (const el of scrollersIn(dialog).slice(-2).reverse()) push(el);
  push(controlColumn(dialog));
  push(dialog);
  return targets;
}

/**
 * Keep this copy's labels pointing at this copy's controls: the drawer can mount a
 * second SettingsPanel, so `id`s may be duplicated between the two surfaces.
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

/** Mount into the first container that actually lays the panel out. */
function mountPanel(dialog) {
  if (hostEl && hostEl.isConnected && currentDialog === dialog) return;

  const state = stateOf(dialog);
  const now = Date.now();
  if (state.attempts >= MAX_ATTEMPTS_PER_DIALOG) return;

  cleanupPanel();

  // Backoff between attempts on the same dialog so React churn cannot turn this
  // into a mount/unmount loop (the previous revision's second freeze source).
  if (state.attempts > 0 && now - state.lastAttemptAt < 1500) return;
  state.attempts += 1;
  state.lastAttemptAt = now;

  for (const target of mountTargets(dialog)) {
    // Skip containers that cannot be showing anything: a hidden tab pane or a
    // display:none wrapper. This avoids mounting the (large) panel to find out.
    if (!isVisible(target) || target.clientHeight < 60) continue;

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

    const rect = host.getBoundingClientRect();
    if (rect.height >= 24 && rect.width >= 40) {
      currentDialog = dialog;
      dialog.setAttribute(DIALOG_ATTR, "1");
      hostEl = host;
      panelInstance = instance;
      everMounted = true;
      document.documentElement.setAttribute(PAGE_ATTR, "available");
      return;
    }

    // Placement did not lay out (clipped wrapper) — undo it and try the next one.
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
  if (!everMounted) document.documentElement.removeAttribute(PAGE_ATTR);
}

/* ── scanning ────────────────────────────────────────────────────────────── */

/** Candidate dialogs, cheap selectors first; the class sweep is rate-limited. */
function candidates() {
  const list = [];
  const push = (el) => {
    if (!isOurNode(el) && isVisible(el)) list.push(el);
  };

  for (const el of document.querySelectorAll(DIALOG_SELECTOR_FAST)) push(el);

  if (!list.length) {
    const now = Date.now();
    if (now - lastSweepAt > 1000) {
      lastSweepAt = now;
      for (const el of document.querySelectorAll('[class*="modal" i]')) {
        if (list.length >= 8) break;
        push(el);
      }
    }
  }
  return list;
}

/** One detection pass. Cheap, idempotent and safe to call often. */
function scan() {
  if (!document.body || scanning || document.hidden) return;

  scanning = true;
  try {
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

    // Nothing matched: when a modal-looking surface is open, say so once per
    // surface so the user can send us its shape instead of guessing.
    for (const candidate of candidates()) {
      if (warnedCandidates.has(candidate)) continue;
      warnedCandidates.add(candidate);
      console.info(
        "[BDS:native-settings] a dialog is open but was not recognised as Settings. " +
          "Run __BDS_DIAG__.dump() and share the output to improve detection.",
        summarize(candidate)
      );
    }
  } finally {
    scanning = false;
  }
}

/** Debounced + rate-limited scan request. */
function scheduleScan() {
  if (scanQueued) return;
  scanQueued = true;
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    scanQueued = false;
    const wait = Math.max(0, SCAN_MIN_INTERVAL_MS - (Date.now() - lastScanAt));
    if (wait > 0) {
      scanTimer = setTimeout(() => {
        lastScanAt = Date.now();
        scan();
      }, wait);
    } else {
      lastScanAt = Date.now();
      scan();
    }
  }, SCAN_DEBOUNCE_MS);
}

/* ── diagnostics ─────────────────────────────────────────────────────────── */

function summarize(el) {
  const rect = el.getBoundingClientRect();
  const rail = findNavRail(el);
  const state = stateOf(el);
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    role: el.getAttribute("role") || undefined,
    class: classNameOf(el).slice(0, 200) || undefined,
    size: [Math.round(rect.width), Math.round(rect.height)],
    controls: el.querySelectorAll(CONTROL_SELECTOR).length,
    controlsLoose: countControls(el),
    rail: rail ? { rows: rowsOf(rail), class: classNameOf(rail).slice(0, 120) } : null,
    attempts: state.attempts,
    text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
    children: [...el.children].slice(0, 8).map((child) => {
      const cls = classNameOf(child).split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      return child.tagName.toLowerCase() + (cls ? "." + cls : "");
    }),
  };
}

function diagnostics() {
  const rect = hostEl?.getBoundingClientRect();
  return {
    url: location.href,
    theme: document.body?.hasAttribute("data-ds-dark-theme") ? "dark" : "light",
    mounted: hostEl
      ? { connected: hostEl.isConnected, size: rect ? [Math.round(rect.width), Math.round(rect.height)] : null }
      : null,
    dialogs: candidates().map((el) => ({ ...summarize(el), recognised: classify(el) !== null })),
  };
}

/* ── public API ──────────────────────────────────────────────────────────── */

/**
 * Start watching for DeepSeek's Settings dialog.
 * Safe to call once from the content-script bootstrap.
 */
export function initNativeSettings() {
  if (observer) return;

  // childList only: attribute mutations fire constantly on this site and used to
  // turn every React re-render into a full scan (see the header note).
  observer = new MutationObserver((mutations) => {
    let interesting = false;
    for (const mutation of mutations) {
      if (hostEl && !hostEl.isConnected) {
        interesting = true;
        break;
      }
      if (mutation.type === "attributes") {
        // Only a dialog container flipping its own class/style matters (e.g. the
        // site showing a modal it had rendered hidden). Everything else React
        // touches is ignored before any layout work happens.
        if (isDialogRootish(mutation.target)) {
          interesting = true;
          break;
        }
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (looksModalish(node)) {
          interesting = true;
          break;
        }
      }
      if (interesting) break;
      for (const node of mutation.removedNodes) {
        if (looksModalish(node)) {
          interesting = true;
          break;
        }
      }
      if (interesting) break;
    }
    if (interesting) scheduleScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden"],
  });

  // Heartbeat: cheap guard that only looks for the dialog hint before scanning.
  heartbeat = setInterval(() => {
    if (document.hidden) return;
    if (hostEl) {
      if (!hostEl.isConnected) scheduleScan();
      return;
    }
    if (document.querySelector(DIALOG_SELECTOR_FAST)) {
      scheduleScan();
      return;
    }
    // Nothing dialog-shaped by the fast selectors: sweep occasionally so markup
    // that only uses hashed class names is still found. This is a full traversal,
    // hence the long interval.
    const now = Date.now();
    if (now - lastSweepHeartbeatAt > SWEEP_HEARTBEAT_MS) {
      lastSweepHeartbeatAt = now;
      scheduleScan();
    }
  }, HEARTBEAT_MS);

  scheduleScan();

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
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  clearTimeout(scanTimer);
  scanQueued = false;
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
  return /(^|\s)bds-/.test(classNameOf(node));
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
  let seen = 0;
  for (const node of nodes) {
    if (++seen > MAX_NODES) break;
    if (looksLikeSettingsItem(node) && inSidebarOrMenu(node)) return node;
  }
  return null;
}

function findAccountButton() {
  const nodes = document.querySelectorAll('button, [role="button"], [class*="avatar" i]');
  let seen = 0;
  for (const node of nodes) {
    if (++seen > MAX_NODES) break;
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
  looksModalish,
  summarize,
  diagnostics,
  scan,
  scheduleScan,
  observerConfig: {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden"],
  },
  guards: { SCAN_DEBOUNCE_MS, SCAN_MIN_INTERVAL_MS, HEARTBEAT_MS, SWEEP_HEARTBEAT_MS, MAX_NODES, MAX_ATTEMPTS_PER_DIALOG },
  HOST_ATTR,
  PAGE_ATTR,
  MODAL_HINT,
};
