/**
 * Tiny static server for the style preview (development only).
 *
 * Serves the repository root so docs/style-preview.html can load the built
 * dist-chrome/content.css with a relative path, and redirects "/" to the
 * preview page so the live-preview tab opens straight into it.
 *
 * Usage: node scripts/serve-preview.js [port]
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const INDEX = "/docs/style-preview.html";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname === "/" || pathname === "") {
      res.writeHead(302, { Location: INDEX });
      res.end();
      return;
    }

    const filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const info = await stat(filePath);
    if (info.isDirectory()) {
      res.writeHead(302, { Location: `${pathname.replace(/\/$/, "")}/index.html` });
      res.end();
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch (_) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Style preview: http://localhost:${PORT}/  (-> ${INDEX})`);
});
