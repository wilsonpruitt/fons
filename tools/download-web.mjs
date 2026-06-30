// One-time download of the complete World English Bible (Protestant canon) used
// as the local source of scripture text for building Catena editions. Run once:
//   node tools/download-web.mjs
// Produces tools/web.json (~8.8 MB, gitignored). Deuterocanonical verses we cite
// live in tools/web-apocrypha.json (committed). weblookup.mjs resolves against both.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const url = "https://api.getbible.net/v2/web.json"; // getbible.net v2, WEB, public domain
const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
const text = await res.text();
writeFileSync(join(here, "web.json"), text);
console.log(`saved tools/web.json (${text.length} bytes)`);
