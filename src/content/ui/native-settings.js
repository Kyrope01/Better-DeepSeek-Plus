/**
 * DeepSeek-native settings bridge.
 *
 * Better DeepSeek's settings are rendered *inside chat.deepseek.com's own Settings
 * dialog*, so the extension adds no button, badge or menu row of its own.
 *
 * ── Finding the dialog without knowing its markup ─────────────────────────────
 * The site is React with hashed CSS-module class names that change between
 * releases, and the Settings dialog carries no stable class or ARIA role. So the
 * dialog is found by **shape and by intent**, never by a class hash or by text:
 *
 *   1. **Trigger capture** — a click on the site's own “Settings” entry marks the
 *      next few seconds as a probe window. Any large element that appears in that
 *      window is treated as the dialog, whatever its class names look like.
 *   2. **Shape** — candidates are resolved to their “card”: if the element covers
 *      the viewport (an overlay/backdrop), the card inside it is the smallest
 *      descendant that has a navigation rail (three or more similar rows stacked
 *      in its left half, found geometrically) or two form controls.
 *   3. **Mounting with proof** — the panel is appended to the dialog's content
 *      column (the area right of the rail), and the placement is measured: the
 *      panel must really lay out inside the card, otherwise the next container is
 *      tried. The host is then fitted to the free height and given its own scroll,
 *      so a short dialog can never clip the panel out of sight.
 *
 * ── Performance contract (a real-account freeze taught this the hard way) ─────
 * The observed DOM is a live chat page: React mutates attributes thousands of
 * times a second and streaming tokens add nodes continuously. Therefore:
 *   • observe `childList` plus a *filtered* attribute set (class/style/hidden),
 *     and only treat an attribute change as interesting when it is on a dialog
 *     container itself — pure string work, no layout reads;
 *   • debounce scans (150 ms), rate-limit them (500 ms), skip while tab hidden;
 *   • bound every DOM walk (MAX_NODES) and every list;
 *   • cache per-dialog classification and rail lookups; cap mount attempts;
 *   • one full-document sweep at most every 5 s.
 *
 * Debugging: `__BDS_DIAG__.dump()` reports every candidate, its resolved card and
 * the mount state; `__BDS_DIAG__.force()` clears the caches and retries at once.
 */

import { mount, unmount } from "svelte";
import appState from "../state.js";
import { i18n, t } from "../../lib/i18n.svelte.js";
import NativeSettingsPanel from "./NativeSettingsPanel.svelte";

const HOST_ATTR = "data-bds-native-settings";
/** Set on <html> once the panel has been shown; diagnostics only. */
const PAGE_ATTR = "data-bds-native-settings-ready";
const DIALOG_ATTR = "data-bds-settings-dialog";

const SCAN_DEBOUNCE_MS = 150;
const SCAN_MIN_INTERVAL_MS = 500;
const HEARTBEAT_MS = 1500;
/** Fallback full-document sweep interval when nothing dialog-shaped is around. */
const SWEEP_HEARTBEAT_MS = 5000;
/** Ceiling for every DOM walk — cost stays constant on huge dialogs. */
const MAX_NODES = 600;
/** Mount attempts allowed per dialog before it is left alone (with backoff). */
const MAX_ATTEMPTS_PER_DIALOG = 4;

/** Elements added to the DOM recently; used for trigger-based discovery. */
const RECENT_TTL_MS = 5000;
const RECENT_MAX = 40;

const SETTINGS_LABELS = ["Settings", "设置", "Настройки", "Ayarlar", "تنظیمات"];

/** Cheap "could this be a dialog?" hint used to filter mutations and heartbeats. */
const MODAL_HINT = [
  ".ds-modal-content",
  ".ds-modal",
  ".ds-dialog",
  "dialog[open]",
  '[role="dialog"]',
  '[class*="modal" i]',
  '[class*="dialog" i]',
].join(", ");

/** Form controls the site uses in settings screens (real elements first). */
const CONTROL_SELECTOR = [
  ".ds-switch",
  '[role="switch"]',
  ".ds-checkbox",
  'input[type="checkbox"]',
  '[role="checkbox"]',
  '[role="radio"]',
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

/** The two most reliable dialog selectors; class sweeps are the fallback. */
const DIALOG_SELECTOR_FAST = '.ds-modal-content, .ds-modal, .ds-dialog, dialog[open], [role="dialog"]';
const DIALOG_SELECTOR_SWEEP = '[class*="modal" i], [class*="dialog" i], dialog';

/** Open shadow roots we have met (the site's 2026 UI uses custom elements). */
const shadowRoots = new Set();
/** MutationObserver per shadow root, disconnected with the bridge. */
const shadowObservers = new Map();
/** Injected copy of content.css for shadow mounts (fetched once). */
const styleCache = { text: null, fetched: false };

let observer = null;
let heartbeat = null;
let hostEl = null;
let panelInstance = null;
let currentDialog = null;
/** "Better DeepSeek" row injected into the dialog's own tab rail. */
let railItemEl = null;
let railEl = null;
/** Card state saved while our view is shown (restored when it is hidden). */
let cardOriginal = null;
/** True while our view covers the dialog's content area. */
let viewActive = false;

/** Once the panel has been shown in this page session the flag stays set. */
let everMounted = false;

let scanTimer = null;
let scanQueued = false;
let lastScanAt = 0;
let lastSweepAt = 0;
let lastSweepHeartbeatAt = 0;
let scanning = false;
/** Last time we told the user the panel could not attach (per probe). */
let lastAttachWarnAt = 0;
/**
 * The most recent mount failure. Kept because a mount error (a missing import in
 * the panel, say) is otherwise only visible in chrome://extensions → Errors —
 * which cost real debugging rounds once. It is reported in the toast log and in
 * __BDS_DIAG__.dump().
 */
let lastMountError = null;

/** Timestamp of the last click on the site's own Settings entry. */
let settingsClickedAt = 0;

const warnedCandidates = new Set();
/** Per-dialog: { attempts, lastAttemptAt, klass, klassAt, rail, railAt } */
const dialogState = new Map();
/** Elements added to the DOM recently (see rememberAdded). */
const recentAdded = [];

/* ── shadow DOM support ──────────────────────────────────────────────────── */

/**
 * Everything the site renders lives in the light DOM today, but its components
 * are custom elements (`<ds-*>`), so an open shadow root would make the dialog
 * invisible to document.querySelectorAll — a silent, total failure. Roots are
 * discovered cheaply: from clicked paths and from freshly added subtrees.
 */
function registerShadowRoot(root) {
  if (!root || root === document || shadowRoots.has(root)) return;
  shadowRoots.add(root);
  if (observer && !shadowObservers.has(root)) {
    const shadowObserver = new MutationObserver((mutations) => {
      let interesting = false;
      for (const mutation of mutations) {
        if (hostEl && !hostEl.isConnected) {
          interesting = true;
          break;
        }
        if (mutation.type === "attributes") {
          if (isDialogRootish(mutation.target)) {
            interesting = true;
            break;
          }
          continue;
        }
        rememberAdded(mutation.addedNodes);
        for (const node of mutation.addedNodes) {
          if (looksModalish(node)) {
            interesting = true;
            break;
          }
        }
        if (interesting) break;
      }
      if (interesting || probing()) scheduleScan();
    });
    shadowObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });
    shadowObservers.set(root, shadowObserver);
  }
  scheduleScan();
}

/** Register any shadow roots inside a freshly added subtree (bounded). */
function collectShadowRootsIn(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.shadowRoot) registerShadowRoot(node.shadowRoot);
  if (node.childElementCount > 400) return;
  for (const el of node.querySelectorAll("*")) {
    if (el.shadowRoot) registerShadowRoot(el.shadowRoot);
  }
}

/** Query roots: the document plus every open shadow root we know. */
function queryRoots(selector) {
  const out = [...document.querySelectorAll(selector)];
  for (const root of shadowRoots) {
    if (!root.isConnected) continue;
    for (const el of root.querySelectorAll(selector)) out.push(el);
  }
  return out;
}

/**
 * Our global stylesheet does not cross a shadow boundary, so a panel mounted
 * inside a shadow root must carry its own copy of content.css.
 */
async function ensureStylesIn(root) {
  if (!root || root === document || !root.host) return;
  if (!styleCache.fetched) {
    styleCache.fetched = true;
    try {
      const response = await fetch(chrome.runtime.getURL("content.css"));
      styleCache.text = await response.text();
    } catch (_) {
      // Fall back to reading the already-injected stylesheet below.
      try {
        const sheet = [...document.styleSheets].find((item) => (item.href || "").includes("content.css"));
        styleCache.text = [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
      } catch (_) {
        styleCache.text = null;
      }
    }
  }
  if (!styleCache.text) return;
  if (root.querySelector("style[" + HOST_ATTR + "-style]")) return;
  const style = document.createElement("style");
  style.setAttribute(HOST_ATTR + "-style", "1");
  style.textContent = styleCache.text;
  root.appendChild(style);
}

/* ── small helpers ───────────────────────────────────────────────────────── */

function stateOf(el) {
  let s = dialogState.get(el);
  if (!s) {
    s = { attempts: 0, mounted: false, lastAttemptAt: 0, klass: null, klassAt: 0, rail: null, railAt: 0 };
    dialogState.set(el, s);
  }
  return s;
}

/** Drop bookkeeping for elements that left the DOM (keeps the Map bounded). */
function pruneState() {
  if (dialogState.size <= 60 && recentAdded.length <= RECENT_MAX * 2) return;
  for (const el of dialogState.keys()) if (!el.isConnected) dialogState.delete(el);
  const now = Date.now();
  while (recentAdded.length && now - recentAdded[0].at > RECENT_TTL_MS) recentAdded.shift();
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
  return !!el.closest?.("#bds-root") || !!el.closest?.(`[${HOST_ATTR}]`);
}

/**
 * Text of a *small* element only. Reading `textContent` serialises the whole
 * subtree, so it must never be done on a container (the click target can be the
 * app root) — that alone is enough to stall the main thread on a big page.
 */
function smallText(el) {
  if (!el || el.nodeType !== 1 || el.childElementCount > 6) return "";
  const text = (el.textContent || "").trim();
  return text.length > 40 ? "" : text;
}

function classNameOf(el) {
  return typeof el.className === "string" ? el.className : el.getAttribute?.("class") || "";
}

function areaOf(el) {
  const rect = el.getBoundingClientRect();
  return rect.width * rect.height;
}

/** How much of the viewport an element covers (0..1+). */
function viewportCover(el) {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  return (rect.width * rect.height) / (vw * vh);
}

/**
 * Attribute changes we care about are class/style flips on a dialog container
 * itself (React showing a modal it had rendered hidden). React also mutates
 * attributes constantly elsewhere — those must not reach the scanner, which is
 * why the observer carries an attributeFilter and this predicate is pure string
 * work with no layout reads.
 */
function isDialogRootish(el) {
  return !!el && el.nodeType === 1 && !!el.matches?.(MODAL_HINT);
}

/** Cheap structural pre-filter: is this element (or its subtree) dialog-shaped? */
function looksModalish(node) {
  if (!node || node.nodeType !== 1) return false;
  if (node.matches?.(MODAL_HINT)) return true;
  return node.childElementCount > 0 && node.childElementCount < 400 && !!node.querySelector?.(MODAL_HINT);
}

/* ── recently added elements (trigger-based discovery) ───────────────────── */

/** Remember freshly added elements so a dialog without any recognisable markup
 *  is still found. Cheap: no layout reads here, only a child-count guard. */
function rememberAdded(nodes) {
  for (const node of nodes) {
    if (node.nodeType !== 1) continue;
    if (node.childElementCount > 800) continue; // virtual lists, streaming blocks
    collectShadowRootsIn(node);
    recentAdded.push({ el: node, at: Date.now() });
  }
  if (recentAdded.length > RECENT_MAX) recentAdded.splice(0, recentAdded.length - RECENT_MAX);
}

function recentCandidates() {
  const now = Date.now();
  const out = [];
  for (let i = recentAdded.length - 1; i >= 0 && out.length < 6; i--) {
    const { el, at } = recentAdded[i];
    if (now - at > RECENT_TTL_MS || !el.isConnected) continue;
    out.push(el);
  }
  return out;
}

/** True while the user has just clicked the site's own Settings entry. */
function probing() {
  return settingsClickedAt > 0 && Date.now() - settingsClickedAt < RECENT_TTL_MS;
}

/** A click on the site's own Settings entry marks a probe window. */
function onDocumentClick(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const target = event.target instanceof Element ? event.target : null;
  if (!target && !path.length) return;

  // Walking the composed path reaches labels inside shadow roots, where
  // event.target would only ever be the shadow host.
  const nodes = path.length ? path : [target];
  let depth = 0;
  for (const node of nodes) {
    if (depth >= 4) break;
    if (!node || node.nodeType !== 1) continue;
    if (isOurNode(node)) return;
    if (typeof node.getRootNode === "function") {
      const root = node.getRootNode();
      if (root && root !== document && root.host) registerShadowRoot(root);
    }
    const text = smallText(node);
    if (!text) continue;
    depth += 1;
    if (SETTINGS_LABELS.some((label) => text === label || text.includes(label))) {
      settingsClickedAt = Date.now();
      scheduleScan();
      return;
    }
  }
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

/**
 * Score a candidate dialog; returns null when it is not a settings surface.
 * `fromProbe` relaxes the control requirement: a click on the site's own Settings
 * entry already proves intent, so a rail or a single control is enough.
 */
function classify(dialog, fromProbe = false) {
  if (isOurNode(dialog) || dialog.hasAttribute(DIALOG_ATTR)) return null;

  const state = stateOf(dialog);
  const now = Date.now();
  if (!fromProbe && state.klass !== null && now - state.klassAt < 1000) return state.klass;

  const remember = (value) => {
    if (!fromProbe) {
      state.klass = value;
      state.klassAt = now;
    }
    return value;
  };

  if (!isVisible(dialog) || isShareLike(dialog)) return remember(null);

  const controls = countControls(dialog);
  const navish = rowsOf(findNavRail(dialog)) >= 3;

  if (!navish && controls < (fromProbe ? 1 : 2)) return remember(null);

  const rect = dialog.getBoundingClientRect();
  const tall = rect.height > window.innerHeight * 0.4;
  if (!navish && !tall) return remember(null);

  const wide = rect.width > window.innerWidth * 0.3;
  return remember((navish ? 6 : 0) + Math.min(controls, 8) * 2 + (tall ? 2 : 0) + (wide ? 1 : 0));
}

/**
 * Resolve a candidate to the dialog “card”: an overlay/backdrop covering the
 * viewport is unwrapped to the small element inside that holds the rail/controls.
 */
function resolveDialog(el) {
  if (viewportCover(el) < 0.8) return el;
  return findCardInside(el) || el;
}

/** Smallest descendant of an overlay that looks like the settings card. */
function findCardInside(overlay) {
  const overlayRect = overlay.getBoundingClientRect();
  const sized = [];
  let seen = 0;

  for (const el of overlay.querySelectorAll('div, section, form, [role="dialog"]')) {
    if (++seen > MAX_NODES) break;
    if (isOurNode(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 280 || rect.height < 200) continue;
    if (rect.width > overlayRect.width * 0.99 || rect.height > overlayRect.height * 0.99) continue;
    sized.push({ el, area: rect.width * rect.height });
  }

  sized.sort((a, b) => a.area - b.area);
  for (const { el } of sized.slice(0, 12)) {
    const rail = findNavRail(el);
    if (rail && rowsOf(rail) >= 3) return el;
    if (countControls(el) >= 2) return el;
  }
  return null;
}

/* ── mounting ────────────────────────────────────────────────────────────── */

/** Real scroll containers inside an element, deepest last (bounded). */
function scrollersIn(root) {
  const found = [];
  let seen = 0;
  for (const el of root.querySelectorAll("div")) {
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

/** The column that holds the dialog's rows: the area right of the rail. */
function contentColumn(card, rail) {
  const kids = [...card.children].filter(
    (el) => el.nodeType === 1 && !isOurNode(el) && el !== rail && !el.contains(rail)
  );
  if (!kids.length) return null;
  const visible = kids.filter(isVisible);
  const pool = visible.length ? visible : kids;
  const withControls = pool.find((el) => el.querySelector(CONTROL_SELECTOR));
  if (withControls) return withControls;
  return pool.sort((a, b) => areaOf(b) - areaOf(a))[0] || null;
}

/** Containers to try, best first: the site's own content column wins. */
function mountTargets(card) {
  const rail = findNavRail(card);
  const column = contentColumn(card, rail);
  const targets = [];
  const push = (el) => {
    if (el && el.isConnected && !targets.includes(el)) targets.push(el);
  };

  if (column) {
    // A scroller inside the column lets the site's own scrolling carry the panel.
    for (const scroller of scrollersIn(column)) push(scroller);
    push(column);
  }
  push(card.querySelector(".ds-modal-content__main"));
  for (const scroller of scrollersIn(card)) push(scroller);
  push(card);
  return targets;
}

/**
 * Keep this copy's labels pointing at this copy's controls: the drawer can mount
 * a second SettingsPanel, so `id`s may be duplicated between the two surfaces.
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

/**
 * Proof of placement: a host that reports a size but sits outside the card (a
 * clipped flex child, a hidden tab pane) is useless — measure instead of assume.
 */
function placementOk(host, card) {
  const rect = host.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  // The overlay is absolutely positioned inside the card, so it must have a real
  // area and overlap the card horizontally.
  if (rect.width < 160 || rect.height < 160) return false;
  if (rect.right < cardRect.left + 80 || rect.left > cardRect.right - 80) return false;
  return true;
}

/** The card must be a positioning context for our overlay. */
function ensureRelative(card) {
  if (window.getComputedStyle(card).position === "static") {
    card.style.position = "relative";
  }
}

/** Where the site's content area starts, relative to the card (right of the rail). */
function contentOffsetLeft(card) {
  const rail = findNavRail(card);
  const cardRect = card.getBoundingClientRect();
  const column = contentColumn(card, rail);
  if (column) {
    const columnRect = column.getBoundingClientRect();
    const offset = Math.max(0, Math.round(columnRect.left - cardRect.left));
    if (offset > 0 && offset < cardRect.width - 180) return offset;
  }
  if (rail) {
    const railRect = rail.getBoundingClientRect();
    const offset = Math.round(railRect.right - cardRect.left + 8);
    if (offset > 0 && offset < cardRect.width - 180) return offset;
  }
  return 0;
}

/** Position the overlay over the dialog's content area (not over the tab rail). */
function placeHost(card) {
  if (!hostEl) return;
  hostEl.style.left = `${contentOffsetLeft(card)}px`;
}

/**
 * When our view is shown the card gets a sensible minimum height, so the panel has
 * room to breathe; the original inline value is restored when the site's own page
 * is shown again.
 */
function fitCard(card, active) {
  if (active) {
    if (!cardOriginal) {
      cardOriginal = { minHeight: card.style.minHeight, hadAttribute: card.hasAttribute("data-bds-view") };
    }
    if (!card.style.minHeight) card.style.minHeight = "min(560px, 78vh)";
    card.setAttribute("data-bds-view", "bds");
  } else if (cardOriginal) {
    card.style.minHeight = cardOriginal.minHeight;
    cardOriginal = null;
    card.removeAttribute("data-bds-view");
  }
}

/**
 * Add “Better DeepSeek” to the dialog's own tab rail, cloned from one of the
 * site's rows so it is styled exactly like General / Profile / Data / About.
 */
function injectRailItem(card) {
  const rail = findNavRail(card);
  if (!rail) return;
  railEl = rail;

  if (railItemEl && railItemEl.isConnected && railItemEl.parentElement === rail) return;

  const rows = [...rail.children].filter(
    (el) => el.nodeType === 1 && !el.hasAttribute("data-bds-rail-item") && el.textContent.trim()
  );
  const template = rows[rows.length - 1];
  if (!template) return;

  const item = template.cloneNode(true);
  item.setAttribute("data-bds-rail-item", "1");
  item.removeAttribute("id");
  // Reuse the template's own markup, swapping only the label text.
  const labelHost = [...item.querySelectorAll("*")].reverse().find((el) => el.textContent.trim());
  if (labelHost) labelHost.textContent = t("drawer.title");
  item.addEventListener("click", (event) => {
    event.stopPropagation();
    activateView();
  });

  rail.appendChild(item);
  railItemEl = item;

  // Clicking any of the site's own rows must reveal that page again.
  if (!rail.dataset.bdsRailBound) {
    rail.dataset.bdsRailBound = "1";
    rail.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("[data-bds-rail-item]")) return;
        showSiteView();
      },
      true
    );
  }
}

/** Show the extension's panel over the dialog's content area. */
function activateView() {
  if (!hostEl || !currentDialog) return;
  hostEl.hidden = false;
  viewActive = true;
  railItemEl?.classList.add("bds-rail-item--active");
  placeHost(currentDialog);
  fitCard(currentDialog, true);
}

/** Reveal the site's own settings page again (our overlay is hidden, not removed). */
function showSiteView() {
  if (!hostEl) return;
  hostEl.hidden = true;
  viewActive = false;
  railItemEl?.classList.remove("bds-rail-item--active");
  fitCard(currentDialog, false);
}

/** Mount into the first container that actually lays the panel out. */
function mountPanel(dialog) {
  if (hostEl && hostEl.isConnected && currentDialog === dialog) return;

  const state = stateOf(dialog);
  const now = Date.now();
  if (state.attempts >= MAX_ATTEMPTS_PER_DIALOG) return;

  cleanupPanel();

  // Backoff between attempts on the same dialog so React churn cannot turn this
  // into a mount/unmount loop.
  if (state.attempts > 0 && now - state.lastAttemptAt < 1200) return;
  state.attempts += 1;
  state.lastAttemptAt = now;

  const card = dialog;
  ensureRelative(card);

  // The overlay lives in the card (full height, so a short content column cannot
  // squeeze it) but starts where the site's content begins, leaving the rail usable.
  const host = document.createElement("div");
  host.className = "bds-native-settings-host";
  host.setAttribute(HOST_ATTR, "1");
  card.appendChild(host);

  if (!placementOk(host, card)) {
    host.remove();
    return;
  }

  let instance = null;
  try {
    const rootNode = card.getRootNode?.();
    if (rootNode && rootNode !== document && rootNode.host) {
      // The global stylesheet does not cross a shadow boundary.
      ensureStylesIn(rootNode);
    }
    instance = mount(NativeSettingsPanel, { target: host });
    scopeLabelTargets(host);
  } catch (err) {
    lastMountError = err;
    console.warn("[BDS:native-settings] mount failed:", err);
    host.remove();
    return;
  }

  currentDialog = card;
  card.setAttribute(DIALOG_ATTR, "1");
  hostEl = host;
  panelInstance = instance;
  everMounted = true;
  state.mounted = true;
  state.attempts = 0;
  dialogState.set(card, state);
  document.documentElement.setAttribute(PAGE_ATTR, "available");

  placeHost(card);
  injectRailItem(card);
  // Shown straight away: the user opened Settings to configure the extension.
  activateView();
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
    fitCard(currentDialog, false);
    currentDialog.removeAttribute(DIALOG_ATTR);
    currentDialog = null;
  }
  if (railItemEl) {
    railItemEl.remove();
    railItemEl = null;
  }
  if (railEl?.dataset?.bdsRailBound) {
    delete railEl.dataset.bdsRailBound;
    railEl = null;
  }
  viewActive = false;
  if (!everMounted) document.documentElement.removeAttribute(PAGE_ATTR);
}

/* ── scanning ────────────────────────────────────────────────────────────── */

/** Candidate dialogs: cheap selectors, then recently added elements, then sweep. */
function candidates() {
  const list = [];
  const push = (el) => {
    if (el instanceof Element && !isOurNode(el) && isVisible(el) && !list.includes(el)) list.push(el);
  };

  for (const el of queryRoots(DIALOG_SELECTOR_FAST)) push(el);

  const probingNow = probing();
  if (list.length < 2 || probingNow) {
    for (const el of recentCandidates()) {
      // During a probe window anything big counts; otherwise it must be large
      // enough to be meant as a dialog rather than a chat bubble.
      if (probingNow || viewportCover(el) >= 0.12) push(el);
      if (list.length >= 8) break;
    }
  }

  if (!list.length) {
    const now = Date.now();
    if (now - lastSweepAt > 1000) {
      lastSweepAt = now;
      for (const el of queryRoots(DIALOG_SELECTOR_SWEEP)) {
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
    pruneState();

    // Already mounted and the dialog is still alive → keep the rail entry alive and
    // the overlay aligned with the site's content area, then stop.
    if (
      hostEl &&
      hostEl.isConnected &&
      currentDialog &&
      currentDialog.isConnected &&
      isVisible(currentDialog)
    ) {
      if (!railItemEl || !railItemEl.isConnected) injectRailItem(currentDialog);
      if (viewActive) placeHost(currentDialog);
      return;
    }

    // Stale instance (dialog closed, tab switched, or React removed our node).
    if (hostEl && (!hostEl.isConnected || !currentDialog || !currentDialog.isConnected)) {
      cleanupPanel();
    }

    const probingNow = probing();
    let best = null;
    let bestScore = 0;
    const unresolved = [];

    for (const candidate of candidates()) {
      const card = resolveDialog(candidate);
      const score = classify(card, probingNow);
      if (score === null) {
        unresolved.push(candidate);
        continue;
      }
      if (score > bestScore) {
        best = card;
        bestScore = score;
      }
    }

    if (best) {
      mountPanel(best);
      return;
    }

    // Nothing matched: when a dialog-looking surface is open, say so once per
    // surface so the user can send us its shape instead of guessing.
    for (const candidate of unresolved) {
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

/**
 * The bridge must never fail silently: when the user opened the site's Settings
 * (so they clearly expect the panel) and nothing mounted within a few seconds,
 * say so once and point at the console for the shape dump.
 */
function maybeWarnAttachFailure() {
  if (!settingsClickedAt || hostEl || everMounted) return;
  const elapsed = Date.now() - settingsClickedAt;
  if (elapsed < 2500 || elapsed > 30000) return;
  if (lastAttachWarnAt === settingsClickedAt) return; // one toast per attempt
  lastAttachWarnAt = settingsClickedAt;
  warnAttachFailure();
}

function warnAttachFailure() {
  let message = "Better DeepSeek could not add its panel to this dialog.";
  try {
    message = i18n.t("settings.nativeAttachFailed");
  } catch (_) {
    // i18n not ready — the English fallback above still tells the user something
  }
  try {
    appState.ui?.showToast?.(message, 8000);
  } catch (_) {
    // no UI available (tests / non-page contexts)
  }
  console.warn(
    `[BDS:native-settings] ${message}`,
    lastMountError ? `Last mount error: ${lastMountError.stack || lastMountError.message || lastMountError}` : ""
  );
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
    at: [Math.round(rect.left), Math.round(rect.top)],
    viewportCover: Number(viewportCover(el).toFixed(2)),
    controls: el.querySelectorAll(CONTROL_SELECTOR).length,
    controlsLoose: countControls(el),
    rail: rail ? { rows: rowsOf(rail), class: classNameOf(rail).slice(0, 120) } : null,
    attempts: state.attempts,
    mounted: state.mounted,
    text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
    children: [...el.children].slice(0, 8).map((child) => {
      const cls = classNameOf(child).split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      return child.tagName.toLowerCase() + (cls ? "." + cls : "");
    }),
  };
}

function diagnostics() {
  const rect = hostEl?.getBoundingClientRect();
  const card = currentDialog;
  const cardRect = card?.getBoundingClientRect();
  return {
    url: location.href,
    theme: document.body?.hasAttribute("data-ds-dark-theme") ? "dark" : "light",
    probing: probing(),
    lastMountError: lastMountError ? String(lastMountError.stack || lastMountError.message || lastMountError) : null,
    settingsClickedAgoMs: settingsClickedAt ? Date.now() - settingsClickedAt : null,
    mounted: hostEl
      ? {
          connected: hostEl.isConnected,
          size: rect ? [Math.round(rect.width), Math.round(rect.height)] : null,
          at: rect ? [Math.round(rect.left), Math.round(rect.top)] : null,
          parentClass: classNameOf(hostEl.parentElement || {}).slice(0, 120),
          fitted: !!hostEl.style.maxHeight,
          cardSize: cardRect ? [Math.round(cardRect.width), Math.round(cardRect.height)] : null,
        }
      : null,
    candidates: candidates().map((el) => {
      const resolved = resolveDialog(el);
      return {
        raw: summarize(el),
        resolvedIsSame: resolved === el,
        resolved: resolved === el ? undefined : summarize(resolved),
        recognised: classify(resolved, true) !== null,
      };
    }),
  };
}

/** Clear every cache/attempt counter and scan immediately (console helper). */
function force() {
  dialogState.clear();
  warnedCandidates.clear();
  settingsClickedAt = Date.now();
  lastScanAt = 0;
  scan();
  return diagnostics();
}

/* ── public API ──────────────────────────────────────────────────────────── */

/**
 * Start watching for DeepSeek's Settings dialog.
 * Safe to call once from the content-script bootstrap.
 */
export function initNativeSettings() {
  if (observer) return;

  // childList + a filtered attribute set: unfiltered attribute observation fires
  // thousands of times per second on this site and used to pin the main thread.
  observer = new MutationObserver((mutations) => {
    let interesting = false;
    for (const mutation of mutations) {
      if (hostEl && !hostEl.isConnected) {
        interesting = true;
        break;
      }
      if (mutation.type === "attributes") {
        if (isDialogRootish(mutation.target)) {
          interesting = true;
          break;
        }
        continue;
      }
      rememberAdded(mutation.addedNodes);
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
    if (interesting || probing()) scheduleScan();
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
    maybeWarnAttachFailure();
    if (hostEl) {
      if (!hostEl.isConnected) scheduleScan();
      return;
    }
    if (document.querySelector(DIALOG_SELECTOR_FAST)) {
      scheduleScan();
      return;
    }
    const now = Date.now();
    if (now - lastSweepHeartbeatAt > SWEEP_HEARTBEAT_MS) {
      lastSweepHeartbeatAt = now;
      scheduleScan();
    }
  }, HEARTBEAT_MS);

  document.addEventListener("click", onDocumentClick, true);

  scheduleScan();

  try {
    window.__BDS_DIAG__ = {
      dump: diagnostics,
      scan,
      force,
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
  for (const shadowObserver of shadowObservers.values()) shadowObserver.disconnect();
  shadowObservers.clear();
  shadowRoots.clear();
  clearTimeout(scanTimer);
  scanQueued = false;
  document.removeEventListener("click", onDocumentClick, true);
  cleanupPanel();
  try {
    delete window.__BDS_DIAG__;
  } catch (_) {
    // ignore
  }
}

/* ── opening the site's own settings ─────────────────────────────────────── */

/** Our own injected rows must never be mistaken for the site's Settings entry. */
function isBdsInjected(node) {
  return /(^|\s)bds-/.test(classNameOf(node));
}

function looksLikeSettingsItem(node) {
  if (isOurNode(node) || isBdsInjected(node) || !isVisible(node)) return false;
  const text = smallText(node);
  if (!text) return false;
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
    settingsClickedAt = Date.now();
    direct.click();
    return true;
  }

  const account = findAccountButton();
  if (!account) return false;

  account.click();
  setTimeout(() => {
    const item = findSettingsItem();
    if (item) {
      settingsClickedAt = Date.now();
      item.click();
    }
  }, 180);
  return true;
}

// Re-export for tests / debugging.
export const __nativeSettingsInternals = {
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
  activateView,
  showSiteView,
  cleanupPanel,
  summarize,
  diagnostics,
  scan,
  scheduleScan,
  force,
  registerShadowRoot,
  collectShadowRootsIn,
  queryRoots,
  onDocumentClick,
  maybeWarnAttachFailure,
  getLastMountError: () => lastMountError,
  warnAttachFailure,
  observerConfig: {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden"],
  },
  guards: {
    SCAN_DEBOUNCE_MS,
    SCAN_MIN_INTERVAL_MS,
    HEARTBEAT_MS,
    SWEEP_HEARTBEAT_MS,
    MAX_NODES,
    MAX_ATTEMPTS_PER_DIALOG,
    RECENT_TTL_MS,
  },
  HOST_ATTR,
  PAGE_ATTR,
  MODAL_HINT,
};
