/**
 * Page-theme watcher.
 *
 * Detects DeepSeek's light/dark mode and persists it to chrome.storage.local so every platform
 * can read STORAGE_KEYS.pageIsDark without relying on the OS dark-mode setting:
 *   - Desktop (Chrome / Firefox): background / popup code reads chrome.storage.local directly.
 *   - Android: the chrome.storage polyfill routes the write through AndroidBridge.setStorage,
 *     and WebViewBridge.getLastKnownIsDark() reads the same SharedPreferences key on startup.
 *
 * Additionally fires AndroidBridge.reportTheme() when available so the native layer can update
 * status/navigation bar icon colours without waiting for the next cold start.
 *
 * Detection is shared with every other light/dark consumer through
 * isPageDark() in src/lib/page-theme.js.
 */

import { STORAGE_KEYS } from "../lib/constants.js";
import { isPageDark, PAGE_THEME_ATTRIBUTES } from "../lib/page-theme.js";

export function startThemeWatcher() {
  function run() {
    apply(isPageDark());
  }
  function apply(isDark) {
    chrome.storage.local.set({ [STORAGE_KEYS.pageIsDark]: isDark });
    // Live notification for Android native bar icon colours. No-op on other platforms.
    // Avoid typeof-function check: JavascriptInterface methods on some WebView versions
    // are callable but do not report as "function" via typeof.
    try {
      window.AndroidBridge?.reportTheme(isDark);
    } catch (_) {}
  }

  run();

  // Primary observer: <body> class *and* attributes (data-ds-dark-theme appears/disappears live).
  new MutationObserver(run).observe(document.body, {
    attributes: true,
    attributeFilter: PAGE_THEME_ATTRIBUTES,
  });

  // Fallback observer: <html> attributes (data-theme or class) for other potential signals.
  new MutationObserver(run).observe(document.documentElement, {
    attributes: true,
    attributeFilter: PAGE_THEME_ATTRIBUTES,
  });

  // OS-level theme changes (covers DeepSeek's "System" setting).
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", run);
}
