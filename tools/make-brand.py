#!/usr/bin/env python3
"""Draw the brand files the website needs that no app repo draws yet, and check them.
Standard library only.

    python3 tools/make-brand.py           write the files below
    python3 tools/make-brand.py --check   change nothing; exit 1 if a file is out of date

Writes, under brand/:

    suite/mark.svg, mark-dark.svg          the suite's mark: the four apps' accents as four
                                           pages in the family's box
    suite/wordmark.svg, wordmark-dark.svg  mark and "method production suite"
    suite/favicon.svg                      the mark on the 16-unit grid

Every app draws its own mark, wordmark and icons in its own repo (scripts/make-brand.py);
tools/sync.py copies them in with each app's site. The letters are tools/glyphs.py, the
family's strokes.
"""

from __future__ import annotations

import sys
from pathlib import Path

from glyphs import DESC_END, W, flip, fmt, rrect, set_name

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "brand"
INK, INK_DARK = "#1C2228", "#E4E8EC"

# Each app's accent, light and dark (the apps' own tokens.css), for the suite's four pages.
ACCENTS = {
    "budget": ("#0E7468", "#2CC7B2"),
    "schedule": ("#2F5FB3", "#7AA2F0"),
    "reader": ("#7052BA", "#B49CF0"),
    "storyteller": ("#AE3D56", "#EE8DA2"),
}

def suite_svg(dark: bool) -> str:
    """Four pages, one per app, in the family's box: the suite is the four together."""
    out = []
    for (x, y), app in zip([(12, 6), (34, 6), (12, 34), (34, 34)], ACCENTS):
        out.append(f'<path fill="{ACCENTS[app][1 if dark else 0]}" d="{rrect(x, y, 18, 24, 3)}"/>')
    return "".join(out)


HEADER = "<!-- {what}. Drawn by the website's tools/make-brand.py; edit that, not this file. -->"


def mark_file(inner: str, label: str, what: str) -> str:
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img"'
            f' aria-label="{label}">\n{HEADER.format(what=what)}\n<title>{label}</title>\n{inner}\n</svg>\n')


def wordmark_file(inner_mark: str, text: str, ink: str, label: str, what: str) -> str:
    """The mark as tall as the ascenders, then the name, on one baseline (base at y 150,
    ascenders at y 10). A name with a descender gets a taller box, as Method Budget's."""
    paths, width = set_name(text)
    base = 150.0
    d = " ".join(flip(p, base) for p in paths)
    k = (base - 10) / 52
    tx, ty = -12 * k, 10 - 6 * k
    name_x = 40 * k + 40
    desc = any(ch in text for ch in "gpy")
    height = base - DESC_END + 10 if desc else 162
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(name_x + width)} {fmt(height)}"'
            f' role="img" aria-label="{label}">\n{HEADER.format(what=what)}\n<title>{label}</title>\n'
            f'<g transform="translate({fmt(tx)} {fmt(ty)}) scale({k:.4f})">{inner_mark}</g>\n'
            f'<path transform="translate({fmt(name_x)} 0)" fill="none" stroke="{ink}"'
            f' stroke-width="{fmt(W)}" d="{d}"/>\n</svg>\n')


def favicon_file(inner_light: str, inner_dark: str, what: str) -> str:
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">\n'
            f'{HEADER.format(what=what)}\n'
            '<style>.d{display:none}@media (prefers-color-scheme:dark){.l{display:none}.d{display:inline}}</style>\n'
            f'<g class="l">{inner_light}</g><g class="d">{inner_dark}</g>\n</svg>\n')


def outputs() -> dict[Path, str | bytes]:
    suite_fav_l = "".join(
        f'<path fill="{ACCENTS[a][0]}" d="{rrect(x, y, 6, 6.5, 1)}"/>'
        for (x, y), a in zip([(1.5, 1), (8.5, 1), (1.5, 8.5), (8.5, 8.5)], ACCENTS))
    suite_fav_d = "".join(
        f'<path fill="{ACCENTS[a][1]}" d="{rrect(x, y, 6, 6.5, 1)}"/>'
        for (x, y), a in zip([(1.5, 1), (8.5, 1), (1.5, 8.5), (8.5, 8.5)], ACCENTS))
    return {
        OUT / "suite" / "mark.svg": mark_file(suite_svg(False), "Method Production Suite", "Method Production Suite mark"),
        OUT / "suite" / "mark-dark.svg": mark_file(suite_svg(True), "Method Production Suite", "Method Production Suite mark"),
        OUT / "suite" / "wordmark.svg": wordmark_file(suite_svg(False), "method production suite", INK, "Method Production Suite", "Method Production Suite wordmark"),
        OUT / "suite" / "wordmark-dark.svg": wordmark_file(suite_svg(True), "method production suite", INK_DARK, "Method Production Suite", "Method Production Suite wordmark"),
        OUT / "suite" / "favicon.svg": favicon_file(suite_fav_l, suite_fav_d, "Method Production Suite favicon"),
    }


def main(argv: list[str]) -> int:
    check = "--check" in argv
    stale = []
    for path, content in outputs().items():
        data = content.encode() if isinstance(content, str) else content
        if not path.exists() or path.read_bytes() != data:
            stale.append(path)
            if not check:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                print(f"wrote {path.relative_to(ROOT)}")
    if check and stale:
        for p in stale:
            sys.stderr.write(f"make-brand: {p.relative_to(ROOT)} is out of date\n")
        return 1
    if not stale:
        print("make-brand: nothing to change")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
