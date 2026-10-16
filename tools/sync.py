#!/usr/bin/env python3
"""Copy each app's site into apps/<slug>/, from the app's own repo. Standard library only.

    python3 tools/sync.py            copy every app whose `source` is a repo
    python3 tools/sync.py budget     copy one

Each app keeps drawing its own page, brand files and pictures in its own repo (its
`site/` folder, held to its releases by that repo's tests). This takes the PUSHED
state of `site/` at the catalog's `source_ref` (origin/<ref>, fetched first) through the
sibling checkout (../<source>), never the working tree or an unpushed local commit, so
half-done local work is never published.
It writes apps/<slug>/SOURCE with the commit it came from. Run it, review the diff,
commit: the website repo's history is the record of what went live.

ArtCraft does the same by hand (each app's pictures copied into the site's
public/images/apps/<slug>/); this makes it one command.
"""

from __future__ import annotations

import io
import shutil
import subprocess
import sys
import tarfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUITE = ROOT.parent  # the folder holding every app checkout side by side
DROP = {"CNAME"}  # the website's domains are set on the Pages project, not per folder


def sync(app: dict) -> None:
    repo = SUITE / app["source"]
    ref = app["source_ref"]
    # Only what is pushed goes live: fetch, then read the remote's copy of the branch,
    # never a local commit nobody has reviewed or pushed.
    subprocess.run(["git", "-C", str(repo), "fetch", "--quiet", "origin", ref], check=True)
    commit = subprocess.run(["git", "-C", str(repo), "rev-parse", f"origin/{ref}"], check=True,
                            capture_output=True, text=True).stdout.strip()
    tar = subprocess.run(["git", "-C", str(repo), "archive", "--format=tar", commit, "site"],
                         check=True, capture_output=True).stdout
    dest = ROOT / "apps" / app["slug"]
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(tar)) as t:
        for m in t.getmembers():
            rel = Path(m.name).relative_to("site") if m.name != "site" else None
            if rel is None or not m.isfile() or rel.name in DROP:
                continue
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(t.extractfile(m).read())
    (dest / "SOURCE").write_text(f"{app['source']} {ref} {commit}\n")
    print(f"{app['slug']}: {app['source']}@{ref} ({commit[:9]})")


def main(argv: list[str]) -> int:
    catalog = tomllib.loads((ROOT / "apps.toml").read_text())
    for app in catalog["app"]:
        if app["source"] == "catalog" or (argv and app["slug"] not in argv):
            continue
        sync(app)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
