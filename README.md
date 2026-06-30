# Fons

*Latin for a spring, a wellhead.* The shared scripture text behind the Wroot Press
reading lenses — the source they point to so a citation becomes the reading itself.

The Bible, public domain, chunked one chapter to a JSON file and served static from
a CDN. A lens fetches one small chapter at a time (~2–5 KB gzipped) and slices the
verses it needs; nobody ever downloads the whole Bible.

## The data

```
/web/<book-slug>/<chapter>.json   { translation, book, slug, chapter, verses:[{v,t}] }
/web/_manifest.json               books, chapter counts, name → slug, aliases
/web/_apocrypha.json              deuterocanon refs the WEB canon omits (exact-ref map)
```

The path is **translation-keyed** (`web/…`) so `kjv/…`, `lxx/…`, and others can be
added later without moving anything. Today only the World English Bible is populated
(66 books, 1,189 chapters, 31,095 verses).

```
GET /web/john/6.json
GET /web/1-kings/14.json
GET /web/psalms/110.json
```

## The client

`client/fons.ts` is a zero-dependency module any lens drops into its `lib/`. It
resolves a human reference against the manifest, fetches the chapter chunk(s), and
returns the verses — caching every request.

```ts
import { passage, setBase } from "@/lib/fons";

const p = await passage("1 Kings 14:21–31");
p.text;    // the verses, joined
p.verses;  // [{ v: 21, t: "Rehoboam…" }, …]
p.book;    // "1 Kings"  (canonical)

// passage() returns null for anything it can't resolve (e.g. an extra-biblical
// citation), so a lens can fall back to showing the bare reference.
```

Handles single verses, ranges (`John 6:1–14`), whole chapters (`Daniel 7`),
cross-chapter ranges (`Ezekiel 2:8–3:3`), and common abbreviations (`1 Cor`, `Jn`).
`setBase(url)` points it at a local dev server instead of the production CDN.

### Dual reference key (Wroot data-repository standard)

Fons honors the cross-project standard: references resolve in **both** human and
**OSIS** form, and every result carries both keys so it joins to the other text
layers (Catena echoes, reception notes, Lectern):

```ts
const p = await passage("Matt.20.29-Matt.21.5"); // OSIS refKey in
p.refKey;     // "Matt.20.29-Matt.21.5"   ← machine join key
p.refDisplay; // "Matthew 20:29–21:5"      ← human string
p.osis;       // "Matt"
```

The manifest carries each book's `osis` code and the store's `versification`
(`KJV/WEB`). Per-*chapter* chunks (not per-book) are a deliberate divergence from
the standard's export shape — the runtime goal is to fetch one small chapter.

## Building & running locally

```
npm run download   # fetch the WEB from getbible.net → tools/web.json (8.4 MB, gitignored)
npm run chunk      # write web/<book>/<chapter>.json + _manifest.json
npm run serve      # static server at http://localhost:4174 (CORS open, like prod)
```

`tools/web.json` is a regenerable build input and is gitignored; the `web/` chunks
are committed (they are what gets deployed). Re-run `chunk` only when the source
text or chunk schema changes.

## Deploy

Static, no framework. `vercel.json` sets open CORS and a one-year immutable cache on
the chapter files; `.vercelignore` keeps `tools/` and `client/` off the CDN. Intended
home: **fons.wrootpress.com**.

## Roadmap

- Populate `lxx/` (Brenton Septuagint) and chunk the full deuterocanon — the two
  sources Catena most needs beyond the Protestant canon.
- Add further public-domain translations (KJV) under their own translation key.
- A versification note per translation (the LXX's Psalm numbering differs).
