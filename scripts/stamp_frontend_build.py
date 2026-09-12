"""Stamp the frontend build marker before publishing to GitHub Pages.

Why this exists (REVIEW.md R-006): the primary frontend (GitHub Pages) updates on
every push to ``master`` while the Cloudflare copy is frozen. Without a visible
build marker the two are indistinguishable from the outside.

This script does two things, both idempotent:

1. Rewrites the ``window.AIMASTER_BUILD = {...}`` line in
   ``frontend/static/js/build-info.js`` with the real commit + build time.
2. Injects ``<script src=".../static/js/build-info.js" defer></script>`` before
   ``</body>`` in every ``frontend/**/*.html`` that does not already load it.

Usage::

    python scripts/stamp_frontend_build.py <commit-sha> [iso-timestamp]
    python scripts/stamp_frontend_build.py --dry-run <commit-sha>
"""
from __future__ import annotations

import posixpath
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
BUILD_INFO = FRONTEND / "static" / "js" / "build-info.js"
SCRIPT_RELATIVE = "static/js/build-info.js"
BUILD_LINE = re.compile(r"^window\.AIMASTER_BUILD\s*=.*$", re.MULTILINE)
BODY_END = re.compile(r"</body\s*>", re.IGNORECASE)


def stamp_build_info(sha: str, built_at: str, dry_run: bool) -> bool:
    text = BUILD_INFO.read_text(encoding="utf-8")
    replacement = f'window.AIMASTER_BUILD = {{ sha: "{sha}", builtAt: "{built_at}" }};'
    updated, count = BUILD_LINE.subn(replacement, text, count=1)
    if count != 1:
        raise SystemExit(f"build-info.js 中未找到可改写的 AIMASTER_BUILD 行：{BUILD_INFO}")
    if not dry_run:
        BUILD_INFO.write_text(updated, encoding="utf-8")
    return True


def inject_pages(dry_run: bool) -> tuple[int, int, list[str]]:
    injected = 0
    skipped = 0
    problems: list[str] = []
    for page in sorted(FRONTEND.rglob("*.html")):
        rel_page = page.relative_to(FRONTEND).as_posix()
        text = page.read_text(encoding="utf-8")
        if "build-info.js" in text:
            skipped += 1
            continue
        if not BODY_END.search(text):
            problems.append(f"没有 </body>，跳过注入：{rel_page}")
            continue
        page_dir = posixpath.dirname(rel_page) or "."
        rel_script = posixpath.relpath(SCRIPT_RELATIVE, page_dir)
        tag = f'<script src="{rel_script}" defer></script>'
        updated = BODY_END.sub(f"{tag}</body>", text, count=1)
        if not dry_run:
            page.write_text(updated, encoding="utf-8")
        injected += 1
    return injected, skipped, problems


def main(argv: list[str]) -> int:
    args = [item for item in argv if item != "--dry-run"]
    dry_run = "--dry-run" in argv
    if not args:
        raise SystemExit(__doc__)
    sha = args[0].strip()
    if len(args) > 1 and args[1].strip():
        built_at = args[1].strip()
    else:
        built_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    short = sha[:7] if sha else "unknown"

    stamp_build_info(short, built_at, dry_run)
    injected, skipped, problems = inject_pages(dry_run)
    mode = "dry-run" if dry_run else "written"
    print(f"build marker [{mode}]: sha={short} builtAt={built_at}")
    print(f"pages injected={injected} already-tagged={skipped}")
    for problem in problems:
        print(f"  warn: {problem}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
