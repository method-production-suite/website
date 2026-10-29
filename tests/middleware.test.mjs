// Runs functions/_middleware.js against every host in the table with a stand-in for
// Cloudflare's asset server (dist/ on disk). `node --test tests/middleware.test.mjs` after a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { onRequest } from "../functions/_middleware.js";

const DIST = new URL("../dist", import.meta.url).pathname;
const assets = {
  async fetch(req) {
    const p = new URL(req.url).pathname;
    const file = DIST + (p.endsWith("/") ? p + "index.html" : p);
    if (existsSync(file)) return new Response(file, { status: 200 });
    // Like Pages: a miss serves the nearest 404.html up the path, with status 404.
    let dir = p.slice(0, p.lastIndexOf("/"));
    for (;;) {
      if (existsSync(DIST + dir + "/404.html")) return new Response(DIST + dir + "/404.html", { status: 404 });
      if (!dir) return new Response("missing", { status: 404 });
      dir = dir.slice(0, dir.lastIndexOf("/"));
    }
  },
};
const run = (u) => onRequest({ request: new Request(u), env: { ASSETS: assets }, next: () => assets.fetch(new Request(u)) });
const body = async (r) => (await r.text()).replace(DIST, "");

test("each app domain serves its own folder at its root", async () => {
  for (const [host, slug] of [["methodbudget.com", "budget"], ["methodschedule.com", "schedule"],
                               ["methodreader.com", "reader"], ["methodstoryteller.com", "storyteller"]]) {
    const r = await run(`https://${host}/`);
    assert.equal(r.status, 200, host);
    assert.equal(await body(r), `/${slug}/index.html`, host);
  }
});

test("an app's sub-pages and the shared files resolve", async () => {
  assert.equal(await body(await run("https://methodbudget.com/releases/")), "/budget/releases/index.html");
  assert.equal(await body(await run("https://methodbudget.com/_suite/suite.css")), "/_suite/suite.css");
});

test("the hub domain serves the hub and the suite's own pages", async () => {
  assert.equal(await body(await run("https://methodproduction.com/")), "/index.html");
  for (const p of ["why", "how", "help"]) {
    assert.equal(await body(await run(`https://methodproduction.com/${p}/`)), `/${p}/index.html`);
  }
});

test("redirect domains and www go where the catalog says, keeping the path", async () => {
  for (const [from, to] of [["https://screepub.com/x?y=1", "https://methodreader.com/x?y=1"],
                            ["https://methodscreenplay.com/", "https://methodstoryteller.com/"],
                            ["https://methodproductionsuite.com/a", "https://methodproduction.com/a"],
                            ["https://www.methodbudget.com/faq", "https://methodbudget.com/faq"],
                            ["https://methodbudget.com/budget/releases/", "https://methodbudget.com/releases/"]]) {
    const r = await run(from);
    assert.equal(r.status, 301, from);
    assert.equal(r.headers.get("location"), to, from);
  }
});

test("a missing page on an app domain is a 404 from that app", async () => {
  const r = await run("https://methodreader.com/nope");
  assert.equal(r.status, 404);
  assert.equal(await body(r), "/reader/404.html");
});

test("the pages.dev preview address is served as built", async () => {
  assert.equal(await body(await run("https://method-website.pages.dev/schedule/")), "/schedule/index.html");
});

test("the Astro files under /_astro/ are shared by every host, like /_suite/", async (t) => {
  if (!existsSync(DIST + "/_astro")) return t.skip("no Astro build in dist/ (npm run build)");
  const file = readdirSync(DIST + "/_astro").find((f) => f.endsWith(".css"));
  for (const host of ["methodproduction.com", "methodbudget.com", "methodreader.com", "method-website.pages.dev"]) {
    assert.equal(await body(await run(`https://${host}/_astro/${file}`)), `/_astro/${file}`, host);
  }
});

test("the hub is the Astro page, complete before any script runs", async (t) => {
  if (!existsSync(DIST + "/_astro")) return t.skip("no Astro build in dist/ (npm run build)");
  const html = readFileSync(DIST + "/index.html", "utf8");
  assert.match(html, /<astro-island/);
  // The content tools/build.py's hub() writes, all in the HTML itself.
  for (const text of ["The apps", "Hear about new releases", "Open, all the way down", "Get all four apps for Mac", "Download for Mac",
                      "Method Storyteller", "Method Reader", "Method Schedule", "Method Budget",
                      "From first draft to last shoot day.", 'class="ms-bar sticky"', 'class="ms-band"']) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(!/field station/i.test(html), "the sample production is never named");
});

test("each app page with an act keeps its policy strict: inline code only by hash", async (t) => {
  if (!existsSync(DIST + "/_astro")) return t.skip("no Astro build in dist/ (npm run build)");
  for (const [slug, act] of [["storyteller", "act-script"], ["schedule", "act-board"], ["budget", "act-budget"]]) {
    const html = readFileSync(`${DIST}/${slug}/index.html`, "utf8");
    assert.ok(html.includes(`class="act ${act}"`), `${slug}: the act is in the HTML`);
    assert.ok(html.includes('class="ms-bar"') && html.includes('class="ms-band"'), `${slug}: suite bar and band`);
    const policy = html.match(/Content-Security-Policy" content="([^"]*)"/)[1];
    assert.match(policy, /default-src 'none'/, slug);
    assert.doesNotMatch(policy, /unsafe-inline/, slug);
    assert.match(policy, /script-src 'self' 'sha256-/, slug);
    assert.ok(!/ style="/.test(html.slice(html.indexOf("<body"))), `${slug}: no inline style attributes`);
    assert.ok(!/field station/i.test(html.slice(html.indexOf("act-section"), html.indexOf("</section>", html.indexOf("act-section")))),
              `${slug}: the act never names the sample production`);
  }
  assert.equal(await body(await run("https://methodschedule.com/")), "/schedule/index.html");
});

test("each app page opens on its value, and its screenshot comes after the act", async (t) => {
  if (!existsSync(DIST + "/_astro")) return t.skip("no Astro build in dist/ (npm run build)");
  for (const slug of ["storyteller", "schedule", "budget"]) {
    const html = readFileSync(`${DIST}/${slug}/index.html`, "utf8");
    const value = html.indexOf('class="pitch value"'), act = html.indexOf('class="act-section"'), shot = html.indexOf('class="shot"');
    assert.ok(value > 0 && value < act, `${slug}: the value line opens the page, before the act`);
    assert.ok(shot > act, `${slug}: the screenshot follows the act`);
  }
});
