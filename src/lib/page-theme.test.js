// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPageDark, readPageToken, PAGE_THEME_ATTRIBUTES } from "./page-theme.js";

function resetDom() {
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.body.className = "";
  document.body.removeAttribute("data-ds-dark-theme");
  document.body.removeAttribute("data-ds-light-theme");
}

describe("isPageDark", () => {
  beforeEach(resetDom);
  afterEach(resetDom);

  it("treats body[data-ds-dark-theme] as dark (current app hook)", () => {
    document.body.setAttribute("data-ds-dark-theme", "");
    expect(isPageDark()).toBe(true);
  });

  it("treats body[data-ds-light-theme] as light even if the OS prefers dark", () => {
    document.body.setAttribute("data-ds-light-theme", "");
    expect(isPageDark()).toBe(false);
  });

  it("falls back to the legacy body class", () => {
    document.body.classList.add("dark");
    expect(isPageDark()).toBe(true);

    document.body.className = "light";
    expect(isPageDark()).toBe(false);
  });

  it("reads html-level signals", () => {
    document.documentElement.classList.add("dark");
    expect(isPageDark()).toBe(true);

    document.documentElement.className = "";
    document.documentElement.setAttribute("data-theme", "dark");
    expect(isPageDark()).toBe(true);
  });

  it("exposes every attribute that can flip the theme", () => {
    expect(PAGE_THEME_ATTRIBUTES).toContain("data-ds-dark-theme");
    expect(PAGE_THEME_ATTRIBUTES).toContain("class");
    expect(PAGE_THEME_ATTRIBUTES).toContain("data-theme");
  });
});

describe("readPageToken", () => {
  it("returns the fallback when the token is not declared", () => {
    expect(readPageToken("--bds-does-not-exist", "#123456")).toBe("#123456");
  });

  it("returns the declared value when the page defines the token", () => {
    document.body.style.setProperty("--bds-test-token", "rgb(1, 2, 3)");
    expect(readPageToken("--bds-test-token", "#000")).toBe("rgb(1, 2, 3)");
    document.body.style.removeProperty("--bds-test-token");
  });
});
