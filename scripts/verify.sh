#!/bin/sh
set -eu

if ! command -v python3 >/dev/null 2>&1; then
    echo "FAIL: Python 3 is required to verify the site." >&2
    exit 1
fi

root=$(CDPATH='' cd "$(dirname "$0")/.." && pwd)
exec python3 -u - "$root" <<'PY'
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
from collections import Counter
from functools import partial
from html import unescape
from html.parser import HTMLParser
from http.client import HTTPConnection, HTTPException
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import quote, unquote, urljoin, urlsplit


ROOT = Path(sys.argv[1])
PROOF = ROOT / ".site-verify-proof"
REQUIRED = (
    "/", "/menu/", "/privacidad/", "/terminos/", "/eliminar-cuenta/",
    "/menu/menu-hilo-negro.pdf", "/menu/vinos-postres.pdf",
    "/images/paquetes/black-christmas.webp",
    "/images/paquetes/brindis-negro.webp",
    "/images/paquetes/noche-de-gala.webp",
)
DRIVE = re.compile(
    rb"(?<![\w.@-])(?:drive\.google\.com|docs\.google\.com|"
    rb"drive\.usercontent\.google\.com|drive\.googleusercontent\.com|"
    rb"(?:[\w-]+\.)?googledrive\.com)(?![\w.-])",
    re.I,
)
CSS_LINK = re.compile(
    r"""(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")]*))\s*\)|@import\s+["']([^"']+)["']|/\*.*?\*/)""",
    re.I | re.S,
)
VOID_TAGS = set("area base br col embed hr img input link meta param source track wbr".split())
URL_ATTRIBUTES = {"action", "cite", "formaction", "href", "poster", "src", "xlink:href"}
TEXT_SUFFIXES = {".css", ".htm", ".html", ".js", ".json", ".md", ".svg", ".txt", ".xml"}


def css_links(source, line=1):
    for match in CSS_LINK.finditer(source):
        url = next((group for group in match.groups() if group is not None), None)
        if url is not None:
            yield url.strip(), line + source.count("\n", 0, match.start())


def srcset_urls(value):
    # A data URL can contain commas. URL tokens end at whitespace or a trailing comma.
    while value.strip(" ,\t\r\n\f"):
        url, *rest = value.lstrip(" ,\t\r\n\f").split(maxsplit=1)
        yield url.rstrip(",")
        value = rest[0] if rest else ""
        if not url.endswith(","):
            value = value.partition(",")[2]


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.tags = Counter()
        self.anchors = set()
        self.ids = set()
        self.references = []
        self.errors = []
        self.base = ""
        self.title = ""
        self.doctype = False
        self.viewport = False

    def handle_decl(self, declaration):
        self.doctype |= declaration.lower() == "doctype html"

    def handle_starttag(self, tag, attributes):
        attrs = {key: value or "" for key, value in attributes}
        line = self.getpos()[0]
        self.tags[tag] += 1
        if tag not in VOID_TAGS:
            self.stack.append(tag)
        if tag == "base" and not self.base:
            self.base = attrs.get("href", "")
        if tag == "meta" and attrs.get("name", "").lower() == "viewport":
            self.viewport |= bool(attrs.get("content", "").strip())
        if attrs.get("id"):
            anchor = attrs["id"]
            if anchor in self.ids:
                self.errors.append(f"line {line}: duplicate id {anchor!r}")
            self.ids.add(anchor)
            self.anchors.add(anchor)
        if tag == "a" and attrs.get("name"):
            self.anchors.add(attrs["name"])
        for key, value in attrs.items():
            if key in URL_ATTRIBUTES or (tag == "object" and key == "data"):
                self.references.append((value, line))
            if key in {"srcset", "imagesrcset"}:
                self.references.extend((url, line) for url in srcset_urls(value))
            if key == "style":
                self.references.extend(css_links(value, line))

    def handle_startendtag(self, tag, attributes):
        self.handle_starttag(tag, attributes)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()
        else:
            self.errors.append(f"line {self.getpos()[0]}: unexpected </{tag}>")

    def handle_data(self, data):
        if self.stack and self.stack[-1] == "title":
            self.title += data
        if self.stack and self.stack[-1] == "style":
            self.references.extend(css_links(data, self.getpos()[0]))

    def finish(self):
        self.close()
        if self.stack:
            self.errors.append(f"unclosed tags: {', '.join(self.stack)}")
        if not self.doctype:
            self.errors.append("missing HTML5 doctype")
        for tag in ("html", "head", "title", "body"):
            if self.tags[tag] != 1:
                self.errors.append(f"expected one <{tag}>, found {self.tags[tag]}")
        if not self.title.strip():
            self.errors.append("missing page title")
        if not self.viewport:
            self.errors.append("missing viewport metadata")


def site_files():
    excluded = {".git", ".github", ".gitignore", ".DS_Store", PROOF.name}
    for directory, folders, files in os.walk(ROOT):
        parent = Path(directory).relative_to(ROOT)
        skip = excluded | ({"scripts", "node_modules"} if parent == Path(".") else set())
        folders[:] = sorted(folder for folder in folders if folder not in skip)
        for name in sorted(set(files) - excluded - {"AGENTS.md", "CLAUDE.md", "README.md", "CNAME"}):
            yield parent / name


def find_targets(errors):
    hostname = (ROOT / "CNAME").read_text().strip().lower()
    apex = hostname.removeprefix("www.")
    internal = {apex, f"www.{apex}"}
    targets = {path: "required path" for path in REQUIRED}
    pages = {}
    references = []
    for file in site_files():
        content = (ROOT / file).read_bytes()
        suffix = file.suffix.lower()
        source = content.decode("utf-8") if suffix in TEXT_SUFFIXES else ""
        searchable = unescape(source).replace(r"\/", "/").encode("utf-8") if source else content
        if b"[PENDIENTE]" in searchable:
            errors.append(f"{file}: contains [PENDIENTE]")
        if DRIVE.search(searchable):
            errors.append(f"{file}: contains a Google Drive link")

        path = "/" + quote(file.as_posix())
        route = path[:-len("index.html")] if file.name == "index.html" else path
        targets.setdefault(route, str(file))
        if suffix in {".html", ".htm"}:
            page = Page()
            page.feed(source)
            page.finish()
            errors.extend(f"{file}: {error}" for error in page.errors)
            pages[path] = pages[route] = page
            base = urljoin(f"https://{hostname}{route}", page.base)
            references.extend((base, url, f"{file}:{line}") for url, line in page.references)
            if not page.errors:
                print(f"HTML OK {file}")
        elif suffix == ".css":
            references.extend(
                (f"https://{hostname}{path}", url, f"{file}:{line}")
                for url, line in css_links(source)
            )

    anchors = {}
    for base, url, source in references:
        try:
            parsed = urlsplit(urljoin(base, url.strip()))
            if parsed.scheme not in {"http", "https"} or parsed.hostname not in internal:
                continue
        except ValueError as error:
            errors.append(f"{source}: invalid link {url!r}: {error}")
            continue
        path = quote(parsed.path or "/", safe="/%:@!$&'()*+,;=-._~")
        query = "?" + quote(parsed.query, safe="%!$&'()*+,;=:/?@") if parsed.query else ""
        targets.setdefault(path + query, source)
        fragment = unquote(parsed.fragment.split(":~:", 1)[0])
        page = pages.get(quote(unquote(path)))
        if page and fragment and fragment.lower() != "top":
            anchors.setdefault((path, fragment), (page, source))

    for (path, fragment), (page, source) in sorted(anchors.items()):
        if fragment not in page.anchors:
            errors.append(f"{source}: missing fragment {path}#{fragment}")
        else:
            print(f"ANCHOR OK {path}#{fragment}")
    return targets, len(set(pages.values())), len(anchors)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_head(self):
        # A directory without an index must not pass via a generated directory listing.
        path = Path(self.translate_path(self.path))
        exact = Path(self.directory)
        for part in path.relative_to(exact).parts:
            # Match GitHub Pages on case-insensitive local file systems.
            if not exact.is_dir() or part not in os.listdir(exact):
                self.send_error(404)
                return None
            exact /= part
        if exact.is_dir() and "index.html" not in os.listdir(exact):
            self.send_error(404, "Directory has no index.html")
            return None
        return super().send_head()


def verify_http(port, targets, errors):
    for path, source in sorted(targets.items()):
        connection = HTTPConnection("127.0.0.1", port, timeout=10)
        try:
            connection.request("GET", path)
            with connection.getresponse() as response:
                response.read()
                print(f"HTTP {response.status} {path}")
                if response.status != 200:
                    errors.append(f"{source}: GET {path} returned HTTP {response.status}")
        except (OSError, HTTPException) as error:
            errors.append(f"{source}: GET {path} failed: {error}")
        finally:
            connection.close()


def screenshots(origin, errors):
    browser = os.environ.get("VERIFY_CHROME") or next(
        (path for name in ("google-chrome", "chromium", "chromium-browser", "chrome")
         if (path := shutil.which(name))),
        None,
    )
    mac_chrome = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    if not browser and mac_chrome.is_file():
        browser = str(mac_chrome)
    node = shutil.which("node")
    if not browser or not node:
        print("SCREENSHOTS SKIPPED: headless Chrome/Chromium and Node.js are needed for capture.")
        print("To capture manually, run python3 -m http.server 8000 --bind 127.0.0.1 from the site root.")
        print("Capture / and /menu/ at http://127.0.0.1:8000 in browser responsive mode at 1280 and 390 px.")
        print(f"Save the PNGs in {PROOF} and stop the manual server with Ctrl+C.")
        print("To use a different headless Chrome binary, set VERIFY_CHROME to its path and rerun.")
        return "skipped"

    PROOF.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="hn-site-verify-") as profile:
        result = subprocess.run(
            [node, str(ROOT / "scripts/verify-screenshots.js"), browser, profile, origin, str(PROOF)],
            check=False,
        )
    if result.returncode:
        errors.append(f"headless screenshot capture exited with status {result.returncode}")
        return "failed"
    return "4 captured"


def main():
    errors = []
    targets, page_count, anchor_count = find_targets(errors)
    handler = partial(QuietHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        origin = f"http://127.0.0.1:{server.server_port}"
        print(f"Serving {ROOT} at {origin}")
        try:
            verify_http(server.server_port, targets, errors)
            screenshot_status = screenshots(origin, errors) if not errors else "skipped after failed checks"
        finally:
            server.shutdown()
            worker.join()

    for error in errors:
        print(f"ERROR: {error}")
    status = f"FAIL ({len(errors)} errors)" if errors else "PASS"
    print(f"{status}: {page_count} HTML pages, {len(targets)} HTTP targets, "
          f"{anchor_count} HTML anchors; screenshots {screenshot_status}.")
    return bool(errors)


def interrupted(signum, frame):
    raise KeyboardInterrupt


signal.signal(signal.SIGTERM, interrupted)
try:
    sys.exit(main())
except KeyboardInterrupt:
    sys.exit("FAIL: verification interrupted.")
except (OSError, ValueError) as error:
    sys.exit(f"FAIL: {error}")
PY
