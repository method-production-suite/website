// The npm side of the suite's 14-day rule: every package in package-lock.json must have
// been published at least 14 days ago, read from the npm registry's publish times (the
// same idea as the crate-age check). `node tools/npm-age.mjs [--days 14] [--json]`.
// Exceptions, one per line as `name@version  reason`, go in tools/npm-age-allow.txt.
import { readFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const days = Number(args[args.indexOf("--days") + 1]) || 14;
const json = args.includes("--json");
const root = new URL("..", import.meta.url);
const lock = JSON.parse(readFileSync(new URL("package-lock.json", root)));
const allowFile = new URL("tools/npm-age-allow.txt", root);
const allow = new Set(existsSync(allowFile)
  ? readFileSync(allowFile, "utf8").split("\n").map((l) => l.split(/\s/)[0]).filter((l) => l && !l.startsWith("#"))
  : []);

const top = new Set(Object.keys({ ...lock.packages[""].dependencies, ...lock.packages[""].devDependencies }));
const pkgs = new Map();
for (const [path, meta] of Object.entries(lock.packages)) {
  if (!path || !meta.version || meta.link) continue;
  const name = meta.name ?? path.slice(path.lastIndexOf("node_modules/") + 13);
  pkgs.set(`${name}@${meta.version}`, { name, version: meta.version, direct: path === `node_modules/${name}` && top.has(name) });
}

const cutoff = Date.now() - days * 86400e3;
const rows = [];
const queue = [...pkgs.values()];
await Promise.all(Array.from({ length: 12 }, async () => {
  for (let p; (p = queue.shift()); ) {
    const res = await fetch(`https://registry.npmjs.org/${p.name.replace("/", "%2F")}`, {
      headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`${p.name}: registry said ${res.status}`);
    const published = (await res.json()).time?.[p.version];
    if (!published) throw new Error(`${p.name}@${p.version}: no publish time`);
    rows.push({ ...p, published, ageDays: Math.floor((Date.now() - Date.parse(published)) / 86400e3),
                young: Date.parse(published) > cutoff && !allow.has(`${p.name}@${p.version}`) });
  }
}));
rows.sort((a, b) => a.ageDays - b.ageDays || a.name.localeCompare(b.name));

if (json) console.log(JSON.stringify(rows, null, 2));
else {
  for (const r of rows.filter((r) => r.direct || r.young))
    console.log(`${r.young ? "YOUNG" : "ok   "} ${String(r.ageDays).padStart(4)}d  ${r.name}@${r.version}${r.direct ? "  (direct)" : ""}`);
  const young = rows.filter((r) => r.young);
  console.log(`npm-age: ${rows.length} packages, youngest ${rows[0]?.ageDays}d (${rows[0]?.name}), ${young.length} under ${days} days`);
}
process.exit(rows.some((r) => r.young) ? 1 : 0);
