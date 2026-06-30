// Tiny static file server for local development — serves the repo root (web/…,
// index.html) with permissive CORS, exactly as the Fons CDN will. Run:
//   node tools/serve.mjs   →   http://localhost:4174
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4174;
const TYPES = { ".json": "application/json", ".html": "text/html", ".ts": "text/plain" };

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  let path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (path === "/") path = "/index.html";
  const file = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ""));
  try {
    const buf = await readFile(file);
    res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.end("404");
  }
}).listen(PORT, () => console.log(`Fons dev → http://localhost:${PORT}`));
