"""Verify that the public AI Master frontend export runs without a backend.
The check uses only the Python standard library. It serves ``frontend`` from a
temporary local port, then verifies the routes and assets that make up the
public learning experience. Run it after rebuilding the export or before
pushing a release.
"""
from __future__ import annotations

import json
import posixpath
from html.parser import HTMLParser
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

PAGES = [
    "/",
    "/dashboard/",
    "/knowledge-stars/",
    "/canvas/",
    "/playground/",
    "/learning-center/",
    "/beginner/",
    "/hands-on/",
    "/ai-review/",
    *[f"/chapter/{chapter_id}/" for chapter_id in range(1, 11)],
    "/static/llm_intro.html",
    "/static/transformer_cg.html",
    "/static/prompt_cg_starlab/index.html",
    "/static/agentic_cg/index.html",
    "/static/claude_cg/index.html",
    "/static/rag_cg/index.html",
    "/static/rag_starlab/index.html",
    "/static/ai_odyssey.html",
    "/static/interview.html",
    "/static/transformer_lab.html",
    "/static/bpe_game.html",
    "/static/llm_training_game.html",
]

ASSETS = [
    "/assets/tokens.css",
    "/assets/frontend.css",
    "/assets/frontend.js",
    "/assets/ai-review.css",
    "/assets/playground.css",
    "/static/js/playground.js",
    "/data/ai-rubric-validation-results.json",
    "/static/js/ai-review.js",
    "/data/knowledge-universe.json",
    "/data/hands-on-tasks.json",
    "/static/vendor/three.r128.min.js",
    "/static/js/knowledge_stars.js",
    "/static/css/knowledge_stars.css",
    "/static/bgm.mp3",
]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        pass


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name in {"href", "src"} and value:
                self.links.append(value)


def verify_internal_links() -> int:
    checked = 0
    for page in FRONTEND.rglob("*.html"):
        parser = LinkParser()
        parser.feed(page.read_text(encoding="utf-8"))
        source = "/" + page.relative_to(FRONTEND).as_posix()
        for raw in parser.links:
            target = urlsplit(raw)
            if target.scheme or target.netloc or raw.startswith(("#", "data:", "javascript:", "/api/")):
                continue
            has_directory_suffix = target.path.endswith("/")
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(source), target.path))
            if resolved == "/":
                candidate = FRONTEND / "index.html"
            else:
                candidate = FRONTEND / resolved.lstrip("/")
                if has_directory_suffix:
                    candidate = candidate / "index.html"
            if not candidate.exists():
                raise FileNotFoundError(f"In {source}, broken internal link '{raw}' resolved to missing '{candidate}'")
            checked += 1
    return checked


def main() -> None:
    handler = partial(QuietHandler, directory=str(FRONTEND))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = server.server_port
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    base_url = f"http://127.0.0.1:{port}"
    print(f"Verifying static frontend demo against {base_url}...")

    try:
        for page in PAGES:
            req = Request(base_url + page)
            with urlopen(req, timeout=5) as response:
                if response.status != 200:
                    raise RuntimeError(f"Failed to fetch {page}: status {response.status}")
                content = response.read().decode("utf-8")
                if "<html" not in content.lower():
                    raise RuntimeError(f"Expected HTML in {page}, received: {content[:200]}")
            print(f"  [OK] {page}")

        for asset in ASSETS:
            req = Request(base_url + asset)
            with urlopen(req, timeout=5) as response:
                if response.status != 200:
                    raise RuntimeError(f"Failed to fetch asset {asset}: status {response.status}")
                data = response.read()
                if not data:
                    raise RuntimeError(f"Empty asset fetched: {asset}")
            print(f"  [OK] Asset {asset} ({len(data)} bytes)")

        checked_links = verify_internal_links()
        print(f"  [OK] Verified {checked_links} internal HTML links across all pages.")

        print("\nAll frontend demo verification checks passed successfully!")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
