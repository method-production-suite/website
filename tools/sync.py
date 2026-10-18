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
import tempfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUITE = ROOT.parent  # the folder holding every app checkout side by side
DROP = {"CNAME"}  # the website's domains are set on the Pages project, not per folder


def sync(app: dict) -> None:
    repo = SUITE / app["source"]
    ref = app["source_ref"]
    # Only what is pushed goes live: fetch, then read the remote's copy of the branch,
    # never a local commit nobody has reviewed or pushed. `tag:<name>` reads a release
    # tag instead, so a released app's site describes exactly what its download does.
    if ref.startswith("tag:"):
        tag = ref[len("tag:"):]
        subprocess.run(["git", "-C", str(repo), "fetch", "--quiet", "--force", "origin",
                        f"refs/tags/{tag}:refs/tags/{tag}"], check=True)
        rev = f"refs/tags/{tag}^{{commit}}"
    else:
        subprocess.run(["git", "-C", str(repo), "fetch", "--quiet", "origin", ref], check=True)
        rev = f"origin/{ref}"
    commit = subprocess.run(["git", "-C", str(repo), "rev-parse", rev], check=True,
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
    if app.get("build"):
        build(app, repo, commit, tar, dest)
    (dest / "SOURCE").write_text(f"{app['source']} {ref} {commit}\n")
    print(f"{app['slug']}: {app['source']}@{ref} ({commit[:9]})")


def build(app: dict, repo: Path, commit: str, _site_tar: bytes, dest: Path) -> None:
    """Run the app's own build for files its site/ doesn't commit (Method Budget's demo),
    in a throwaway export of the same commit, never in the app's working checkout. A
    shared target folder outside the repo keeps rebuilds fast."""
    full = subprocess.run(["git", "-C", str(repo), "archive", "--format=tar", commit],
                          check=True, capture_output=True).stdout
    cache = Path.home() / "Library" / "Caches" / "method-website" / f"target-{app['slug']}"
    with tempfile.TemporaryDirectory(prefix=f"method-website-{app['slug']}-") as tmp:
        with tarfile.open(fileobj=io.BytesIO(full)) as t:
            t.extractall(tmp, filter="data")
        # The repo's own target/ is linked to the cache (some xtasks read target/ by
        # path, so CARGO_TARGET_DIR alone isn't enough).
        cache.mkdir(parents=True, exist_ok=True)
        (Path(tmp) / "target").symlink_to(cache, target_is_directory=True)
        print(f"{app['slug']}: building {' '.join(app['build'])} at {commit[:9]}")
        subprocess.run(app["build"], cwd=tmp, check=True)
        out = Path(tmp) / app["build_output"]
        if not (out / "index.html").is_file():
            raise SystemExit(f"sync: {app['slug']}: the build wrote no {app['build_output']}/index.html")
        target = dest / Path(app["build_output"]).relative_to("site")
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(out, target)
        print(f"{app['slug']}: copied {sum(1 for _ in target.rglob('*') if _.is_file())} built files into {target.relative_to(ROOT)}")


def main(argv: list[str]) -> int:
    catalog = tomllib.loads((ROOT / "apps.toml").read_text())
    for app in catalog["app"]:
        if app["source"] == "catalog" or (argv and app["slug"] not in argv):
            continue
        sync(app)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
