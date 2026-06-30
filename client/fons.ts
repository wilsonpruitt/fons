// Fons — the shared scripture-text client. Drop this one file into any Wroot Press
// lens (Catena, Annales, …) and turn a citation into the reading itself:
//
//   import { passage } from "@/lib/fons";
//   const p = await passage("1 Kings 14:21–31");
//   p.text      // the verses, joined
//   p.verses    // [{ v: 21, t: "Rehoboam…" }, …]
//
// It fetches per-chapter JSON chunks from the Fons CDN (one small request per
// chapter, cached), resolving human references — single verses, ranges, whole
// chapters, cross-chapter ranges, common abbreviations — against the manifest.
// Zero dependencies; runs in the browser and in Node 18+.

export type Verse = { v: number; t: string };
export type Passage = {
  ref: string; // the reference as called
  refKey: string; // OSIS machine key, e.g. "1Kgs.14.21-1Kgs.14.31" (Wroot data standard)
  refDisplay: string; // human string, e.g. "1 Kings 14:21–31"
  book: string; // canonical book name, e.g. "1 Kings"
  slug: string; // url slug, e.g. "1-kings"
  osis: string; // OSIS book code, e.g. "1Kgs"
  chapter: number; // the opening chapter
  verses: Verse[];
  text: string; // verses joined with a space
};

type Book = { name: string; slug: string; osis: string; chapters: number };

type Manifest = {
  translation: string;
  books: Book[];
  aliases: Record<string, string>;
};

const DEFAULT_BASE = "https://fons.wrootpress.com";

let _base = DEFAULT_BASE;
export function setBase(url: string) {
  _base = url.replace(/\/$/, "");
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// ---- caches (promise-deduped so concurrent callers share one fetch) ----
const _manifests = new Map<string, Promise<Manifest>>();
const _chapters = new Map<string, Promise<Verse[]>>();
let _bookIndex: Map<string, Book> | null = null;

function manifest(translation: string): Promise<Manifest> {
  const key = `${_base}/${translation}`;
  let p = _manifests.get(key);
  if (!p) {
    p = fetch(`${_base}/${translation}/_manifest.json`).then((r) => {
      if (!r.ok) throw new Error(`Fons: no manifest for "${translation}" (${r.status})`);
      return r.json() as Promise<Manifest>;
    });
    _manifests.set(key, p);
  }
  return p;
}

async function bookIndex(translation: string) {
  if (_bookIndex) return _bookIndex;
  const m = await manifest(translation);
  const idx = new Map<string, Book>();
  for (const b of m.books) {
    idx.set(norm(b.name), b);
    if (b.osis) idx.set(norm(b.osis), b); // OSIS code resolves too ("Matt", "1Kgs")
  }
  for (const [alias, canonical] of Object.entries(m.aliases)) {
    const b = idx.get(norm(canonical));
    if (b) idx.set(norm(alias), b);
  }
  _bookIndex = idx;
  return idx;
}

function chapterVerses(translation: string, slug: string, chapter: number): Promise<Verse[]> {
  const key = `${_base}/${translation}/${slug}/${chapter}`;
  let p = _chapters.get(key);
  if (!p) {
    p = fetch(`${_base}/${translation}/${slug}/${chapter}.json`).then((r) => {
      if (!r.ok) throw new Error(`Fons: ${slug} ${chapter} not found (${r.status})`);
      return r.json().then((c: { verses: Verse[] }) => c.verses);
    });
    _chapters.set(key, p);
  }
  return p;
}

// ---- reference parsing ----
export type ParsedRef = {
  book: string; // raw book text as written
  chapter: number;
  vStart?: number;
  endChapter?: number;
  vEnd?: number;
};

// Human ("1 Kings 14:21–31", "Daniel 7") and OSIS refKey ("1Kgs.14.21-1Kgs.14.31",
// "Matt.20.29-Matt.21.5") forms both parse. Returns the book as written; passage()
// resolves it (OSIS code or name/alias) against the manifest.
export function parseRef(ref: string): ParsedRef | null {
  const clean = ref
    .replace(/[‒–—―]/g, "-") // figure/en/em dashes → hyphen
    .replace(/\s+/g, " ")
    .trim();

  // OSIS refKey: Book.ch.v[-[Book.]ch.v]  (dotted, no space before the chapter)
  const o = clean.match(/^([0-9A-Za-z]+)\.(\d+)\.(\d+)(?:-(?:[0-9A-Za-z]+\.)?(\d+)\.(\d+))?$/);
  if (o) {
    const [, book, ch, vs, ec, ve] = o;
    const out: ParsedRef = { book, chapter: Number(ch), vStart: Number(vs) };
    if (ve) {
      out.vEnd = Number(ve);
      if (ec && Number(ec) !== Number(ch)) out.endChapter = Number(ec);
    }
    return out;
  }

  const m = clean.match(/^(.+?)\s+(\d+)(?::(\d+))?(?:\s*-\s*(?:(\d+):)?(\d+))?$/);
  if (!m) return null;
  const [, book, ch, vs, ec, ve] = m;
  const out: ParsedRef = { book: book.trim(), chapter: Number(ch) };
  if (vs) out.vStart = Number(vs);
  if (ve) {
    if (ec) {
      out.endChapter = Number(ec);
      out.vEnd = Number(ve);
    } else if (vs) {
      out.vEnd = Number(ve); // range within the chapter
    } else {
      out.endChapter = Number(ve); // whole-chapter range, e.g. "John 6-7"
    }
  }
  return out;
}

// ---- the main call ----
export async function passage(
  ref: string,
  opts: { translation?: string } = {},
): Promise<Passage | null> {
  const translation = opts.translation ?? "web";
  const parsed = parseRef(ref);
  if (!parsed) return null;

  const idx = await bookIndex(translation);
  const book = idx.get(norm(parsed.book));
  if (!book) return null;

  const startCh = parsed.chapter;
  const endCh = parsed.endChapter ?? parsed.chapter;
  const verses: Verse[] = [];

  for (let ch = startCh; ch <= endCh && ch <= book.chapters; ch++) {
    let chVerses: Verse[];
    try {
      chVerses = await chapterVerses(translation, book.slug, ch);
    } catch {
      return verses.length ? finish() : null;
    }
    const isFirst = ch === startCh;
    const isLast = ch === endCh;
    const lo = isFirst && parsed.vStart ? parsed.vStart : -Infinity;
    const hi = isLast && parsed.vEnd ? parsed.vEnd : isLast && parsed.vStart && !parsed.endChapter ? parsed.vStart : Infinity;
    for (const v of chVerses) if (v.v >= lo && v.v <= hi) verses.push(v);
  }

  function finish(): Passage {
    const b = book!;
    const v1 = verses[0].v;
    const vN = verses[verses.length - 1].v;
    const wholeChapter = parsed!.vStart === undefined;
    const refKey =
      startCh === endCh && v1 === vN
        ? `${b.osis}.${startCh}.${v1}`
        : `${b.osis}.${startCh}.${v1}-${b.osis}.${endCh}.${vN}`;
    const refDisplay = wholeChapter
      ? startCh === endCh
        ? `${b.name} ${startCh}`
        : `${b.name} ${startCh}–${endCh}`
      : startCh === endCh
        ? v1 === vN
          ? `${b.name} ${startCh}:${v1}`
          : `${b.name} ${startCh}:${v1}–${vN}`
        : `${b.name} ${startCh}:${v1}–${endCh}:${vN}`;
    return {
      ref,
      refKey,
      refDisplay,
      book: b.name,
      slug: b.slug,
      osis: b.osis,
      chapter: startCh,
      verses,
      text: verses.map((v) => v.t).join(" "),
    };
  }
  return verses.length ? finish() : null;
}

// Clear in-memory caches (e.g. when switching base URLs in dev).
export function clearCache() {
  _manifests.clear();
  _chapters.clear();
  _bookIndex = null;
}
