#!/usr/bin/env python3
"""Hand apps.toml and the hub's tokens to the Astro hub. Standard library only.

    python3 tools/catalog.py            production links (each app's own domain)
    python3 tools/catalog.py --local    /<slug>/ links, for a plain local server

Writes .catalog/catalog.json (the catalog, plus the link mode) and .catalog/hub-tokens.css
(shared/tokens-base.css with the hub's accent, contrast-checked by tools/build.py's tokens()).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import CAT, HUB, ROOT, tokens  # noqa: E402

out = ROOT / ".catalog"
out.mkdir(exist_ok=True)
(out / "catalog.json").write_text(json.dumps({**CAT, "local": "--local" in sys.argv}, indent=2) + "\n")
(out / "hub-tokens.css").write_text(tokens(*HUB))
print(f"catalog: .catalog/ written ({len(CAT['app'])} apps)")
