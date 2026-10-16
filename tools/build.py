#!/usr/bin/env python3
"""Build the Method Production Suite website into dist/. Standard library only.

    python3 tools/build.py            the production build (links use each app's domain)
    python3 tools/build.py --local    links use /<slug>/ paths, for a plain local server

What it writes:

    dist/index.html, sitemap.xml, 404.html   the hub (methodproduction.com)
    dist/<slug>/...                          each app's site from apps/<slug>/ (tools/sync.py),
                                             with the suite bar and band added to every page
    dist/storyteller/                        Method Storyteller's page, written from the
                                             catalog (it has no site of its own yet)
    dist/_suite/                             suite.css and every app's mark, shared by all
    functions/_hosts.js                      host -> app table for functions/_middleware.js

Everything comes from apps.toml, so adding an app is one entry (and, if it has a site,
one `tools/sync.py` run). Cloudflare Pages runs this with build command
`python3 tools/build.py` and output directory `dist`.
"""

from __future__ import annotations

import html
import json
import re
import shutil
import sys
import tomllib
from pathlib import Path

from glyphs import ratio

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
CAT = tomllib.loads((ROOT / "apps.toml").read_text())
SUITE, APPS = CAT["suite"], CAT["app"]
LOCAL = "--local" in sys.argv
E = html.escape


def url(slug: str | None) -> str:
    """Where a link to an app (or, with None, the hub) points."""
    if LOCAL:
        return "/" if slug is None else f"/{slug}/"
    if slug is None:
        return f"https://{SUITE['domain']}/"
    return f"https://{next(a for a in APPS if a['slug'] == slug)['domain']}/"


def mark(app: dict, dark: bool = False) -> str:
    return f"/_suite/marks/{app['slug']}{'-dark' if dark else ''}.svg"


def picture(src_light: str, src_dark: str, alt: str, attrs: str = "") -> str:
    return (f'<picture><source srcset="{src_dark}" media="(prefers-color-scheme: dark)">'
            f'<img src="{src_light}" alt="{E(alt)}"{attrs}></picture>')


# ------------------------------------------------------------------ shared furniture

GITHUB_PATH = '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>'


def github(href: str, label: str, size: int, cls: str = "gh") -> str:
    """A GitHub mark linking to `href`; the label is what a screen reader says."""
    return (f'<a class="{cls}" href="{href}" aria-label="{E(label)}" title="{E(label)}">'
            f'<svg viewBox="0 0 16 16" width="{size}" height="{size}" aria-hidden="true" fill="currentColor">'
            f'{GITHUB_PATH}</svg></a>')


def bar(current: str | None) -> str:
    links = []
    for a in APPS:
        cur = ' aria-current="page"' if a["slug"] == current else ""
        short = a["name"].removeprefix("Method ")
        links.append(
            f'<a href="{url(a["slug"])}"{cur}>{picture(mark(a), mark(a, True), "", " width=\"14\" height=\"14\"")}'
            f'<span><span class="ms-name-long">Method </span>{E(short)}</span></a>')
    home_cur = ' aria-current="page"' if current is None else ""
    return (
        '<nav class="ms-bar" aria-label="Method Production Suite"><div class="ms-in">'
        f'<a class="ms-home" href="{url(None)}"{home_cur}>'
        f'{picture("/_suite/marks/suite.svg", "/_suite/marks/suite-dark.svg", "", " width=\"14\" height=\"14\"")}'
        f'{E(SUITE["name"])}</a>' + "".join(links)
        + github(SUITE["org"], f'{SUITE["name"]} on GitHub', 16, "ms-gh") + "</div></nav>")


def band() -> str:
    items = "".join(
        f'<li><a href="{url(a["slug"])}">{picture(mark(a), mark(a, True), "", " width=\"28\" height=\"28\"")}'
        f'<span><strong>{E(a["name"])}</strong>{E(a["tagline"])}</span></a></li>' for a in APPS)
    return (
        '<aside class="ms-band" aria-label="The Method Production Suite"><div class="ms-in">'
        f'<a class="ms-title" href="{url(None)}">'
        f'{picture("/_suite/marks/suite.svg", "/_suite/marks/suite-dark.svg", "", " width=\"18\" height=\"18\"")}'
        f'{E(SUITE["name"])}</a><ul>{items}</ul>'
        f'<p class="ms-fine">Free and open source, every app MIT or Apache-2.0. '
        f'<a href="{SUITE["org"]}">All of it on GitHub</a>.</p></div></aside>')


def furnish(page: str, current: str | None) -> str:
    """Add the suite stylesheet, bar and band to one page of an app's site."""
    if "ms-bar" in page:
        raise SystemExit("build: a page already has the suite bar")
    page = page.replace("</head>", '<link rel="stylesheet" href="/_suite/suite.css">\n</head>', 1)
    page = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + "\n" + bar(current), page, count=1)
    page = page.replace("</body>", band() + "\n</body>", 1)
    return page


# ------------------------------------------------------------------ tokens for pages we write

BASE_TOKENS = ROOT / "shared" / "tokens-base.css"


def tokens(light: dict, dark: dict) -> str:
    """The family's tokens (shared/tokens-base.css) with an accent of the page's own."""
    for scheme, bg, s2 in ((light, "#F7F6F2", "#EFEDE7"), (dark, "#111417", "#22272E")):
        for fg, back, need in ((scheme["accent"], bg, 4.5), (scheme["accent"], s2, 4.5),
                               (scheme["accent-ink"], scheme["accent"], 4.5),
                               (scheme["accent-strong"], scheme["accent-soft"], 4.5)):
            if ratio(fg, back) < need:
                raise SystemExit(f"build: {fg} on {back} is {ratio(fg, back):.2f}:1, needs {need}")
    def block(s: dict) -> str:
        return "".join(f"  --{k}: {v};\n" for k, v in s.items())
    base = BASE_TOKENS.read_text()
    return (base.replace("  /* ACCENT LIGHT */\n", block(light))
                .replace("    /* ACCENT DARK */\n", "  " + block(dark).replace("\n  ", "\n    ")))


STORYTELLER = (
    {"accent": "#AE3D56", "accent-strong": "#8C2F44", "accent-ink": "#FFFFFF", "accent-soft": "#F6E4E8"},
    {"accent": "#EE8DA2", "accent-strong": "#F5B4C3", "accent-ink": "#24101A", "accent-soft": "#3D1F27"},
)
HUB = (
    {"accent": "#1C2228", "accent-strong": "#000000", "accent-ink": "#FFFFFF", "accent-soft": "#E6E3DB"},
    {"accent": "#E4E8EC", "accent-strong": "#FFFFFF", "accent-ink": "#111417", "accent-soft": "#2B3138"},
)


# ------------------------------------------------------------------ pages we write

def head(title: str, desc: str, canonical: str, favicon: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<link rel="icon" href="{favicon}" type="image/svg+xml">
<meta name="theme-color" content="#F7F6F2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111417" media="(prefers-color-scheme: dark)">
<link rel="stylesheet" href="assets/tokens.css">
<link rel="stylesheet" href="/_suite/site.css">
<link rel="stylesheet" href="/_suite/suite.css">
</head>
"""


def hub() -> str:
    cards = "".join(f"""
      <article class="app-card" style="--app-accent:{a['accent'][0]};--app-accent-dark:{a['accent'][1]}">
        <a class="app-link" href="{url(a['slug'])}">
          {picture(mark(a), mark(a, True), "", ' width="56" height="56"')}
          <span class="does">{E(a['does'])}</span>
          <h3>{E(a['name'])}</h3>
          <p class="tagline">{E(a['tagline'])}</p>
        </a>
        <p>{E(a['blurb'])}</p>
        <p class="meta"><span class="pill{' ok' if a['status'] == 'Released' else ''}">{E(a['status'])}</span>
          <a href="{url(a['slug'])}">{E(a['domain'])}</a> {github(a['repo'], f"{a['name']} on GitHub", 18)}</p>
      </article>""" for a in APPS)
    flow = "".join(f'<li><span>{E(a["does"])}</span> {E(a["name"])}</li>' for a in APPS)
    return head(SUITE["name"], SUITE["lede"], f"https://{SUITE['domain']}/", "/_suite/marks/suite-favicon.svg") + f"""<body>
<a class="skip" href="#main">Skip to content</a>
{bar(None)}
<main id="main">
  <section class="hero"><div class="wrap">
    <h1>{picture("/_suite/brand/suite/wordmark.svg", "/_suite/brand/suite/wordmark-dark.svg", SUITE["name"], ' class="hub-wm" width="640" height="52"')}</h1>
    <p class="pitch">{E(SUITE['pitch'])}</p>
    <p class="lede">{E(SUITE['lede'])}</p>
    <ol class="flow" aria-label="How the apps fit together">{flow}</ol>
  </div></section>
  <section class="band alt" aria-labelledby="apps-h"><div class="wrap">
    <h2 id="apps-h">The apps</h2>
    <div class="app-grid">{cards}
    </div>
  </div></section>
  <section class="band" aria-labelledby="open-h"><div class="wrap">
    <h2 id="open-h">Open, all the way down</h2>
    <div class="cards three">
      <div class="card"><h3>Your computer, your files</h3><p>Every app runs on your own machine and works offline. Nothing about your production is uploaded anywhere.</p></div>
      <div class="card"><h3>Open formats</h3><p>Scripts are Fountain, budgets and schedules are documented text files you can read, diff and keep in version control.</p></div>
      <div class="card"><h3>Free and open source</h3><p>MIT or Apache-2.0, on GitHub, with every decision written down in each repo.</p></div>
    </div>
  </div></section>
</main>
{band()}
</body>
</html>
"""


def storyteller(app: dict) -> str:
    feats = [
        ("Write without thinking about formatting", "Tab and Enter move between scene heading, action, character, parenthetical, dialogue and transition. Character, location and time-of-day autocomplete."),
        ("Pages that break like a production's", "Courier Prime 12 point, standard margins, 55 lines a page, (MORE) and (CONT'D) at page breaks, and scene headings that never strand at the bottom of a page."),
        ("Open formats", "Fountain is the native file: plain text, diff friendly. .fdx files open and save, and PDF export embeds its fonts and bookmarks every scene."),
        ("Scriptable", "Every action is a named command and a JSON-lines control channel drives the app, or a headless engine, from a script or a coding agent."),
    ]
    cards = "".join(f'<div class="card"><h3>{E(t)}</h3><p>{E(d)}</p></div>' for t, d in feats)
    return head(f"{app['name']}: open-source screenwriting", app["blurb"], f"https://{app['domain']}/", "favicon.svg") + f"""<body>
<a class="skip" href="#main">Skip to content</a>
{bar(app['slug'])}
<main id="main">
  <section class="hero"><div class="wrap">
    <h1>{picture("assets/brand/wordmark.svg", "assets/brand/wordmark-dark.svg", app["name"], ' width="560" height="52"')}</h1>
    <p class="pitch">{E(app['tagline'])}</p>
    <p class="lede">An open-source screenwriting app for macOS, Windows and Linux, being written from scratch in Rust. {E(app['blurb'])}</p>
    <div class="cta">
      <a class="btn primary" href="{app['repo']}">Get it on GitHub</a>
      <span class="pill">{E(app['status'])}: build it from source today; installers come with the first release.</span>
    </div>
  </div></section>
  <section class="band alt" aria-labelledby="f-h"><div class="wrap">
    <h2 id="f-h">What it does</h2>
    <div class="cards two">{cards}</div>
  </div></section>
  <section class="band" aria-labelledby="run-h"><div class="wrap">
    <h2 id="run-h">Run it</h2>
    <p>With Rust installed, from a checkout of <a href="{app['repo']}">the repository</a>:</p>
    <pre><code>cargo run --release -p method-storyteller -- path/to/script.fountain</code></pre>
    <p>The command-line tool converts, paginates and exports without a window:</p>
    <pre><code>cargo run -p storyteller-cli -- pdf script.fountain script.pdf</code></pre>
  </div></section>
</main>
{band()}
</body>
</html>
"""


def page_404() -> str:
    return head("Not found", "This page does not exist.", f"https://{SUITE['domain']}/", "/_suite/marks/suite-favicon.svg").replace(
        'href="assets/tokens.css"', 'href="/_suite/hub-tokens.css"') + f"""<body>
{bar(None)}
<main class="wrap" style="padding:72px 16px"><h1 class="pitch">That page isn't here.</h1>
<p class="lede"><a href="{url(None)}">Go to the Method Production Suite</a>, or pick an app above.</p></main>
{band()}
</body>
</html>
"""


# ------------------------------------------------------------------ build

def write(path: Path, text: str | bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    (path.write_bytes if isinstance(text, bytes) else path.write_text)(text)


def main() -> int:
    if DIST.exists():
        shutil.rmtree(DIST)
    s = DIST / "_suite"
    write(s / "suite.css", (ROOT / "shared" / "suite.css").read_text())
    write(s / "site.css", (ROOT / "shared" / "site.css").read_text())
    shutil.copytree(ROOT / "brand", s / "brand")

    # One copy of every app's mark for the bar, band and hub.
    for a in APPS:
        src = ROOT / "brand" / "storyteller" if a["source"] == "catalog" else ROOT / "apps" / a["slug"] / "assets" / "brand"
        for dark in (False, True):
            name = "mark-dark.svg" if dark else "mark.svg"
            write(s / "marks" / f"{a['slug']}{'-dark' if dark else ''}.svg", (src / name).read_bytes())
    write(s / "marks" / "suite.svg", (ROOT / "brand/suite/mark.svg").read_bytes())
    write(s / "marks" / "suite-dark.svg", (ROOT / "brand/suite/mark-dark.svg").read_bytes())
    write(s / "marks" / "suite-favicon.svg", (ROOT / "brand/suite/favicon.svg").read_bytes())

    # The apps.
    for a in APPS:
        out = DIST / a["slug"]
        if a["source"] == "catalog":
            write(out / "index.html", storyteller(a))
            write(out / "assets" / "tokens.css", tokens(*STORYTELLER))
            for f in ("mark.svg", "mark-dark.svg", "wordmark.svg", "wordmark-dark.svg"):
                write(out / "assets" / "brand" / f, (ROOT / "brand/storyteller" / f).read_bytes())
            for f in ("favicon.svg", "favicon.ico", "apple-touch-icon.png"):
                write(out / f, (ROOT / "brand/storyteller" / f).read_bytes())
            continue
        shutil.copytree(ROOT / "apps" / a["slug"], out, ignore=shutil.ignore_patterns("SOURCE"))
        for page in out.rglob("*.html"):
            if page.name == "og-card.html":
                continue  # drawn to og.png, never shown
            write(page, furnish(page.read_text(), a["slug"]))

    # Every app answers a missing page with its own 404, or the suite's.
    for a in APPS:
        if not (DIST / a["slug"] / "404.html").exists():
            write(DIST / a["slug"] / "404.html", page_404())

    # The hub.
    write(DIST / "assets" / "tokens.css", tokens(*HUB))
    write(s / "hub-tokens.css", tokens(*HUB))
    write(DIST / "index.html", hub())
    write(DIST / "404.html", page_404())
    write(DIST / "robots.txt", f"User-agent: *\nAllow: /\nSitemap: https://{SUITE['domain']}/sitemap.xml\n")
    locs = [f"https://{SUITE['domain']}/"] + [f"https://{a['domain']}/" for a in APPS]
    write(DIST / "sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + "".join(f"  <url><loc>{u}</loc></url>\n" for u in locs) + "</urlset>\n")

    # The host table the Pages middleware routes by (committed; the build checks it).
    hosts = {SUITE["domain"]: {"app": None}}
    for a in APPS:
        hosts[a["domain"]] = {"app": a["slug"]}
    for r in SUITE["redirects"]:
        hosts[r["from"]] = {"redirect": r["to"]}
    table = "// Written by tools/build.py from apps.toml. Do not edit.\nexport const HOSTS = " + json.dumps(hosts, indent=2) + ";\n"
    write(ROOT / "functions" / "_hosts.js", table)

    print(f"build: dist/ written ({'local' if LOCAL else 'production'} links), "
          f"{sum(1 for _ in DIST.rglob('*') if _.is_file())} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
