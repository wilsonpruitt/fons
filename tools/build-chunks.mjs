// Chunk the World English Bible into per-chapter JSON files that Fons serves as a
// static, addressable scripture source. Reads tools/web.json (the getbible.net WEB
// download, regenerable via download-web.mjs) and writes:
//
//   public/web/<book-slug>/<chapter>.json   — { translation, book, slug, chapter, verses:[{v,t}] }
//   public/web/_manifest.json               — books, chapter counts, name→slug, aliases
//
// The path layout is translation-keyed (web/…) so kjv/…, lxx/… can be added later
// without moving anything. Run: node tools/build-chunks.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const TRANSLATION = "web";
const outDir = join(root, TRANSLATION);

const web = JSON.parse(readFileSync(join(here, "web.json"), "utf8"));

const slugify = (name) =>
  name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

// Canonical OSIS book codes — the machine join key in the Wroot data-repository
// standard (refKey). Emitted per book so any project keying on OSIS (e.g.
// "Matt.20.1-Matt.20.16") can resolve text from Fons directly.
const OSIS = {
  Genesis: "Gen", Exodus: "Exod", Leviticus: "Lev", Numbers: "Num", Deuteronomy: "Deut",
  Joshua: "Josh", Judges: "Judg", Ruth: "Ruth", "1 Samuel": "1Sam", "2 Samuel": "2Sam",
  "1 Kings": "1Kgs", "2 Kings": "2Kgs", "1 Chronicles": "1Chr", "2 Chronicles": "2Chr",
  Ezra: "Ezra", Nehemiah: "Neh", Esther: "Esth", Job: "Job", Psalms: "Ps", Proverbs: "Prov",
  Ecclesiastes: "Eccl", "Song of Songs": "Song", Isaiah: "Isa", Jeremiah: "Jer",
  Lamentations: "Lam", Ezekiel: "Ezek", Daniel: "Dan", Hosea: "Hos", Joel: "Joel", Amos: "Amos",
  Obadiah: "Obad", Jonah: "Jonah", Micah: "Mic", Nahum: "Nah", Habakkuk: "Hab",
  Zephaniah: "Zeph", Haggai: "Hag", Zechariah: "Zech", Malachi: "Mal", Matthew: "Matt",
  Mark: "Mark", Luke: "Luke", John: "John", Acts: "Acts", Romans: "Rom", "1 Corinthians": "1Cor",
  "2 Corinthians": "2Cor", Galatians: "Gal", Ephesians: "Eph", Philippians: "Phil",
  Colossians: "Col", "1 Thessalonians": "1Thess", "2 Thessalonians": "2Thess",
  "1 Timothy": "1Tim", "2 Timothy": "2Tim", Titus: "Titus", Philemon: "Phlm", Hebrews: "Heb",
  James: "Jas", "1 Peter": "1Pet", "2 Peter": "2Pet", "1 John": "1John", "2 John": "2John",
  "3 John": "3John", Jude: "Jude", Revelation: "Rev",
};

// Human aliases / abbreviations → canonical getbible name. The client merges this
// with the canonical names to resolve a reference's book.
const ALIASES = {
  "psalm": "Psalms",
  "ps": "Psalms",
  "psa": "Psalms",
  "song of solomon": "Song of Songs",
  "canticles": "Song of Songs",
  "song": "Song of Songs",
  "gen": "Genesis",
  "exod": "Exodus",
  "exo": "Exodus",
  "lev": "Leviticus",
  "num": "Numbers",
  "deut": "Deuteronomy",
  "deu": "Deuteronomy",
  "josh": "Joshua",
  "judg": "Judges",
  "1 sam": "1 Samuel",
  "2 sam": "2 Samuel",
  "1 kgs": "1 Kings",
  "2 kgs": "2 Kings",
  "1 chron": "1 Chronicles",
  "2 chron": "2 Chronicles",
  "1 chr": "1 Chronicles",
  "2 chr": "2 Chronicles",
  "neh": "Nehemiah",
  "esth": "Esther",
  "prov": "Proverbs",
  "eccl": "Ecclesiastes",
  "qoh": "Ecclesiastes",
  "isa": "Isaiah",
  "jer": "Jeremiah",
  "lam": "Lamentations",
  "ezek": "Ezekiel",
  "eze": "Ezekiel",
  "dan": "Daniel",
  "hos": "Hosea",
  "obad": "Obadiah",
  "mic": "Micah",
  "nah": "Nahum",
  "hab": "Habakkuk",
  "zeph": "Zephaniah",
  "hag": "Haggai",
  "zech": "Zechariah",
  "zec": "Zechariah",
  "mal": "Malachi",
  "matt": "Matthew",
  "mt": "Matthew",
  "mk": "Mark",
  "mr": "Mark",
  "lk": "Luke",
  "jn": "John",
  "rom": "Romans",
  "1 cor": "1 Corinthians",
  "2 cor": "2 Corinthians",
  "gal": "Galatians",
  "eph": "Ephesians",
  "phil": "Philippians",
  "php": "Philippians",
  "col": "Colossians",
  "1 thess": "1 Thessalonians",
  "2 thess": "2 Thessalonians",
  "1 thes": "1 Thessalonians",
  "2 thes": "2 Thessalonians",
  "1 tim": "1 Timothy",
  "2 tim": "2 Timothy",
  "tit": "Titus",
  "philem": "Philemon",
  "phlm": "Philemon",
  "heb": "Hebrews",
  "jas": "James",
  "1 pet": "1 Peter",
  "2 pet": "2 Peter",
  "1 jn": "1 John",
  "2 jn": "2 John",
  "3 jn": "3 John",
  "rev": "Revelation",
  "apoc": "Revelation",
};

if (existsSync(outDir)) {
  // keep _apocrypha.json (lives in public/web); only clear book folders
  for (const b of web.books) {
    const d = join(outDir, slugify(b.name));
    if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
}
mkdirSync(outDir, { recursive: true });

const books = [];
let chapterCount = 0;
let verseCount = 0;

for (const b of web.books) {
  const slug = slugify(b.name);
  const bookDir = join(outDir, slug);
  mkdirSync(bookDir, { recursive: true });
  for (const c of b.chapters) {
    const verses = c.verses.map((v) => ({
      v: v.verse,
      t: v.text.replace(/\s+/g, " ").trim(),
    }));
    verseCount += verses.length;
    const chunk = {
      translation: TRANSLATION,
      book: b.name,
      slug,
      chapter: c.chapter,
      verses,
    };
    writeFileSync(join(bookDir, `${c.chapter}.json`), JSON.stringify(chunk));
    chapterCount += 1;
  }
  books.push({ name: b.name, slug, osis: OSIS[b.name] ?? null, chapters: b.chapters.length });
}

const missingOsis = books.filter((b) => !b.osis).map((b) => b.name);
if (missingOsis.length) console.warn(`WARN: no OSIS code for: ${missingOsis.join(", ")}`);

const manifest = {
  translation: TRANSLATION,
  name: "World English Bible",
  license: "Public Domain",
  versification: "KJV/WEB",
  source: "getbible.net v2",
  books,
  aliases: ALIASES,
};
writeFileSync(join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(
  `Fons: wrote ${chapterCount} chapter chunks across ${books.length} books (${verseCount} verses) to ${TRANSLATION}/`,
);
