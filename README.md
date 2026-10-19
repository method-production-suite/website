# Method Production Suite website

One site for every Method app: the hub at methodproduction.com, and each app on its own
domain (methodbudget.com, methodschedule.com, methodreader.com, methodstoryteller.com),
all from one Cloudflare Pages project. Every page carries the same suite bar and band,
so the apps link to each other.

## How it fits together

| Path | What |
|---|---|
| `apps.toml` | The catalog. One entry per app drives the hub's cards, the suite bar and band, the sitemap and the domain routing. |
| `apps/<slug>/` | Each app's own site, copied from its repo's `site/` by `tools/sync.py` (with a `SOURCE` file naming the commit). Edit an app's page in its own repo, then sync. |
| `brand/` | Brand files no app repo draws yet: the suite's mark and wordmark, and Method Storyteller's provisional mark, drawn by `tools/make-brand.py` from the family's letters in `tools/glyphs.py`. |
| `shared/` | `suite.css` (the bar and band, on every page), `site.css` and `tokens-base.css` (for the pages this repo writes). |
| `tools/build.py` | Writes `dist/`: the hub, each app with the bar and band added, Method Storyteller's page from its catalog entry, and `functions/_hosts.js`. |
| `src/` | The hub as an Astro page (spike, branch `astro-spike`): `src/pages/index.astro` at parity with `build.py`'s `hub()`, and React islands in `src/components/islands/` for the motion (sticky suite bar, fanning hero, pinned story, dots into cards). Vendored component-library code, with its licence, lives in `src/components/vendor/`. |
| `tools/catalog.py`, `tools/merge-astro.mjs` | Hand `apps.toml` and the hub's tokens to Astro; put the Astro hub (`index.html`, `/_astro/`) over the Python one in `dist/`. |
| `functions/_middleware.js` | Picks what each domain serves (Cloudflare Pages Functions). Tested by `tests/middleware.test.mjs`. |

## Commands

```bash
python3 tools/sync.py          # copy every app's committed site/ in (or: sync.py budget)
python3 tools/make-brand.py    # redraw brand/ (--check to verify)
python3 tools/build.py         # production build into dist/ (--local for /<slug>/ links)
node --test tests/middleware.test.mjs   # domain routing, against the last build
```

Standard library Python and Node's built-in test runner only: no npm, no dependencies.

The Astro hub (spike) adds npm, under the suite's rules: `package-lock.json` committed,
`npm ci` only, exact versions, `ignore-scripts=true` (`.npmrc`), and only Astro,
`@astrojs/react`, React and one motion library (`motion`). Every package in the lock must be
at least 14 days old:

```bash
npm ci                      # install exactly the lock, no install scripts
npm run build               # build.py, then the Astro hub over dist/index.html
npm run build:local         # the same with /<slug>/ links
npm test                    # domain routing and the hub, against the last build
npm run age                 # every locked package's npm publish time, 14-day rule
```

To update, resolve as of 14 days ago: `npm install --before=<date 14 days ago> <pkg>@<version>`.

## Hosting

Cloudflare Pages, project `method-website`: build command `python3 tools/build.py`, output
directory `dist`, root directory `/`. Each domain is a custom domain on the project; DNS
for every Method domain (and screepub.com) is in the same Cloudflare account.
Redirect-only domains (methodproductionsuite.com, methodscreenplay.com, screepub.com) are
custom domains on the project too; the middleware 301s them.

The middleware runs on every request, which counts against Pages Functions' free
allowance (100,000 requests a day at the time of writing). If the sites outgrow that,
split into one Pages project per app built with the same script.

## Rules

- Copy follows the family voice: plain, specific, no hype, no em dashes, no other
  vendor's product names.
- No personal or company names in anything public.
- MIT OR Apache-2.0, like the apps.
