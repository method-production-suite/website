// Runs functions/_middleware.js against every host in the table with a stand-in for
// Cloudflare's asset server (dist/ on disk). `node --test tests/middleware.test.mjs` after a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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

test("the hub domain serves the hub", async () => {
  assert.equal(await body(await run("https://methodproduction.com/")), "/index.html");
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
