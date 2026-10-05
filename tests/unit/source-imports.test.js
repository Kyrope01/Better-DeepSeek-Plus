/**
 * Static guard for a bug class that shipped once and was only visible on the live
 * site: a component used a shared singleton (`appState`) without importing it, so
 * mounting it threw `ReferenceError: appState is not defined` — invisible to
 * builds, lint-free, and never exercised because nothing rendered that component.
 *
 * This test walks the source tree and checks that every use of the shared
 * singletons below has a matching import in the same file. It is deliberately
 * simple and comment-stripped to keep false positives at zero.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// `remoteConfig` is deliberately excluded: background/index.js destructures it as a
// callback parameter, which a pattern-based check cannot tell apart from a global.
const WATCHED = ["appState", "i18n", "storage"];

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(svelte|js)$/.test(entry.name) && !/\.test\.js$/.test(entry.name) && !/\.spec\.js$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Code of the file without comments: <script> blocks for Svelte, whole file for JS. */
function computableCode(file, raw) {
  const blocks = file.endsWith(".svelte")
    ? [...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join("\n")
    : raw;
  return blocks
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("source import hygiene", () => {
  const files = sourceFiles(path.resolve(process.cwd(), "src"));

  it("finds the source tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("never uses a shared singleton it does not import", () => {
    const offenders = [];

    for (const file of files) {
      const code = computableCode(file, fs.readFileSync(file, "utf8"));
      for (const id of WATCHED) {
        const used = new RegExp(`(^|[^.\\w$])${id}\\s*[.?]`).test(code);
        if (!used) continue;

        const declared =
          new RegExp(`(import|const|let|var|function)\\s[^\\n]*\\b${id}\\b`).test(code) ||
          new RegExp(`\\{[^}]*\\b${id}\\b[^}]*\\}\\s*=`).test(code);
        if (!declared) {
          offenders.push(`${path.relative(process.cwd(), file)} uses "${id}" but never imports it`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
