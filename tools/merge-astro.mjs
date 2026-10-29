// Put the Astro pages over the Python ones: every .astro-dist/**/index.html replaces the
// same page in dist/ (the hub, and each app page Astro builds), and .astro-dist/_astro/
// (the islands' scripts and the pages' stylesheets) becomes dist/_astro/. Everything else
// in dist/ (the apps' pictures and assets, /_suite/, the suite pages) is tools/build.py's.
import { createHash } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// A page with its own Content Security Policy (the app sites allow nothing inline) keeps it,
// with exactly the inline scripts and styles Astro wrote added by hash, and script-src
// 'self' for the islands' files under /_astro/. Inline style attributes stay blocked, so
// the acts never use them (src/lib/styler.ts).
function allowInline(html) {
  const meta = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/;
  if (!meta.test(html)) return html;
  const hash = (body) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`;
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => hash(m[1]));
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => hash(m[1]));
  if (/ style="/.test(html.slice(html.indexOf("<body")))) throw new Error("merge-astro: an inline style attribute the policy would block");
  return html.replace(meta, (_, a, policy, z) => {
    const parts = policy.split(";").map((p) => p.trim()).filter(Boolean).filter((p) => !p.startsWith("script-src"));
    const i = parts.findIndex((p) => p.startsWith("style-src"));
    if (i >= 0) parts[i] = [parts[i], ...new Set(styles)].join(" ");
    else parts.push(["style-src 'self'", ...new Set(styles)].join(" "));
    parts.push(["script-src 'self'", ...new Set(scripts)].join(" "));
    return a + parts.join("; ") + z;
  });
}

const root = new URL("..", import.meta.url).pathname;
const from = `${root}.astro-dist`;
const to = `${root}dist`;
if (!existsSync(`${to}/_suite`)) throw new Error("merge-astro: run tools/build.py first");
rmSync(`${to}/_astro`, { recursive: true, force: true });
const pages = readdirSync(from, { recursive: true }).filter((p) => String(p).endsWith(".html")).map(String);
for (const p of pages) {
  if (p !== "index.html" && !existsSync(`${to}/${p}`)) throw new Error(`merge-astro: ${p} has no page in dist/ to replace`);
  writeFileSync(`${to}/${p}`, allowInline(readFileSync(`${from}/${p}`, "utf8")));
}
if (existsSync(`${from}/_astro`)) cpSync(`${from}/_astro`, `${to}/_astro`, { recursive: true });
// Astro names these files by content hash, so they can be cached for good.
writeFileSync(`${to}/_headers`, "/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n");
console.log(`merge-astro: ${pages.join(", ")} and dist/_astro/ are Astro's`);
