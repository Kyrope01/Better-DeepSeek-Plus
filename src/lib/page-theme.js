/**
 * Single source of truth for "is chat.deepseek.com currently dark?".
 *
 * The site has used three hooks over time and all of them still appear in the
 * wild (and in the Android WebView shell):
 *   1. body[data-ds-dark-theme] / body[data-ds-light-theme] — current app hook
 *   2. body class "dark" / "light"                           — legacy shell
 *   3. html class / data-theme                               — other shells
 *   4. prefers-color-scheme                                  — "System" setting
 *
 * Everything that needs a light/dark decision (theme watcher, HTML/PDF export,
 * chart rendering, ...) must agree, so they all call isPageDark().
 */

/** Attributes whose changes can flip the page theme. */
export const PAGE_THEME_ATTRIBUTES = [
  "class",
  "data-ds-dark-theme",
  "data-ds-light-theme",
  "data-theme",
];

/**
 * @returns {boolean} true when the DeepSeek page is rendered in dark mode.
 */
export function isPageDark() {
  if (typeof document === "undefined") return false;

  const body = document.body;
  if (body) {
    if (body.hasAttribute("data-ds-dark-theme")) return true;
    if (body.hasAttribute("data-ds-light-theme")) return false;
    if (body.classList.contains("dark")) return true;
    if (body.classList.contains("light")) return false;
  }

  const root = document.documentElement;
  if (root) {
    if (root.classList.contains("dark") || root.getAttribute("data-theme") === "dark") return true;
    if (root.classList.contains("light") || root.getAttribute("data-theme") === "light") return false;
  }

  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Reads one of the page's own design tokens (e.g. "--dsr-text-3") and returns
 * it as a CSS colour string. Falls back when the page does not define it.
 *
 * @param {string} name custom property name, dashes included
 * @param {string} fallback value used when the token is absent/empty
 * @param {Element} [probe] element to read from (defaults to <body>)
 */
export function readPageToken(name, fallback, probe) {
  if (typeof window === "undefined" || !window.getComputedStyle) return fallback;
  const el = probe || document.body || document.documentElement;
  if (!el) return fallback;
  try {
    const value = window.getComputedStyle(el).getPropertyValue(name);
    return value && value.trim() ? value.trim() : fallback;
  } catch (_) {
    return fallback;
  }
}
