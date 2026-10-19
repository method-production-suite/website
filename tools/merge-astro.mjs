// Put the Astro hub over the Python one: .astro-dist/index.html becomes dist/index.html and
// .astro-dist/_astro/ (the islands' scripts and the hub's stylesheet) becomes dist/_astro/.
// Everything else in dist/ (the apps, /_suite/, the suite pages) is tools/build.py's.
import { writeFileSync, cpSync, existsSync, rmSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const from = `${root}.astro-dist`;
const to = `${root}dist`;
if (!existsSync(`${to}/_suite`)) throw new Error("merge-astro: run tools/build.py first");
rmSync(`${to}/_astro`, { recursive: true, force: true });
cpSync(`${from}/index.html`, `${to}/index.html`);
if (existsSync(`${from}/_astro`)) cpSync(`${from}/_astro`, `${to}/_astro`, { recursive: true });
// Astro names these files by content hash, so they can be cached for good.
writeFileSync(`${to}/_headers`, "/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n");
console.log("merge-astro: dist/index.html and dist/_astro/ are the Astro hub");
