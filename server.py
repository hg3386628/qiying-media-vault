#!/usr/bin/env python3
"""
Local static server for the 帖子库.

- Serves index.html / styles.css / app.js / media-data / vendor
- /api/img  : local cache (external drive) first, then public CDN
- /api/proxy: generic allowed-host proxy
- /api/hls  : HLS playlist proxy — rewrites key/ts URLs through /api/proxy
              so browser playback avoids multi-CDN CORS / referrer issues

Image cache written by cache_images.py:
  /Volumes/app/cdn-data-cache/images/<cdn-path>
Override with env CDN_IMAGE_CACHE.
"""

from __future__ import annotations

import mimetypes
import os
import time
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("SITE_ROOT", str(PROJECT_ROOT))).expanduser().resolve()
PORT = int(os.environ.get("PORT", "8787"))

CACHE_ROOT = Path(os.environ.get("CDN_IMAGE_CACHE", "/Volumes/app/cdn-data-cache"))
IMAGE_CACHE_DIR = CACHE_ROOT / "images"

IMG_PUBLIC = "https://imgpublic.ycomesc.live"
ALLOWED_IMG_HOSTS = {
    "imgpublic.ycomesc.live",
    "pic.jjlxoi.cn",
    "pic.uforxk.cn",
    "image.qzycbu.cn",
    "new.qzycbu.cn",
    "pwa.eisees.com",
}

# Video CDN hosts seen in m3u8 (playlist / crypt.key / .ts)
ALLOWED_VIDEO_HOSTS = {
    "hls.ffxddn.cn",
    "op.vkjyoi.cn",
    "qw.bgqpnx.cn",
    "as.bgqpnx.cn",
    "ts.hhjd.mobi",
    "ts.syjiaotong.mobi",
    "tts.doudou520.online",
    "syjiaotong.mobi",
    "hhjd.mobi",
    "bgqpnx.cn",
    "vkjyoi.cn",
    "ffxddn.cn",
    "doudou520.online",
}

ALLOWED_PROXY_HOSTS = ALLOWED_IMG_HOSTS | ALLOWED_VIDEO_HOSTS

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# absolute URL in playlist
ABS_URL_RE = re.compile(r"https?://[^\s\"']+")
URI_ATTR_RE = re.compile(r'URI="(https?://[^"]+)"')

import hashlib

HLS_KEY = "RnOxyCIc5eDPFpJY"
VID_CDN_PRIMARY = "https://hls.ffxddn.cn"
VID_CDN_ALTS = ["https://hls.ffxddn.cn", "https://op.vkjyoi.cn"]


def path_only(raw: str) -> str:
    if not raw:
        return ""
    s = str(raw).strip()
    if s.startswith("http://") or s.startswith("https://"):
        try:
            s = urllib.parse.urlparse(s).path or ""
        except Exception:
            return ""
    if s and not s.startswith("/"):
        s = "/" + s
    return s.split("?", 1)[0].split("#", 1)[0]


def sign_video_url(raw_path: str, cdn_base: str = VID_CDN_PRIMARY, v: str = "3", t1: str = "0") -> str:
    """Same auth_key algorithm as the original frontend."""
    pth = path_only(raw_path)
    if not pth:
        return ""
    time_now = int(time.time())
    rand = hashlib.md5(f"{pth}{time_now}".encode()).hexdigest()[:13]
    uid = t1 if v == "3" else "0"
    data = f"{pth}-{time_now}-{rand}-{uid}-{HLS_KEY}"
    sign = hashlib.md5(data.encode()).hexdigest()
    base = (cdn_base or VID_CDN_PRIMARY).rstrip("/")
    return f"{base}{pth}?auth_key={time_now}-{rand}-{uid}-{sign}&v={v}&time={t1}"



def host_allowed(url: str, hosts: set[str]) -> bool:
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower()
    except Exception:
        return False
    if not host:
        return False
    if host in hosts:
        return True
    # allow subdomains of registered apex if apex listed
    for h in hosts:
        if host.endswith("." + h) or host == h:
            return True
    return False


def is_allowed(url: str, hosts: set[str]) -> bool:
    return host_allowed(url, hosts)


def rewrite_to_public_cdn(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return url
    if not parsed.hostname or parsed.hostname not in ALLOWED_IMG_HOSTS:
        return url
    if parsed.hostname == "imgpublic.ycomesc.live":
        return url
    path = parsed.path or "/"
    return f"{IMG_PUBLIC}{path}"


def cache_path_for_url(url: str) -> Path | None:
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return None
    path = parsed.path or ""
    if not path or path == "/":
        return None
    rel = path.lstrip("/")
    parts = Path(rel).parts
    if not parts or any(p in ("", ".", "..") for p in parts):
        return None
    try:
        base = IMAGE_CACHE_DIR.resolve()
    except OSError:
        return None
    candidate = IMAGE_CACHE_DIR / Path(*parts)
    try:
        candidate = candidate.resolve()
        candidate.relative_to(base)
    except (OSError, ValueError):
        return None
    try:
        if candidate.is_file() and candidate.stat().st_size > 0:
            return candidate
    except OSError:
        return None
    return None


def guess_image_type(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".svg": "image/svg+xml",
    }.get(ext, "application/octet-stream")


def fetch_remote(
    url: str,
    timeout: int = 30,
    extra_headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    headers = {
        "User-Agent": UA,
        "Accept": "*/*",
        "Referer": "https://www.91cg1.com/",
        "Origin": "https://www.91cg1.com",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
            status = getattr(resp, "status", 200) or 200
            out = {
                "Content-Type": resp.headers.get("Content-Type")
                or "application/octet-stream",
                "Cache-Control": "public, max-age=300",
                "Access-Control-Allow-Origin": "*",
            }
            if resp.headers.get("Content-Length"):
                out["Content-Length"] = resp.headers["Content-Length"]
            return status, out, resp.read()
    except urllib.error.HTTPError as e:
        body = e.read() if hasattr(e, "read") else b""
        return e.code, {
            "Content-Type": e.headers.get("Content-Type", "text/plain")
            if e.headers
            else "text/plain",
            "Access-Control-Allow-Origin": "*",
        }, body
    except Exception as e:
        return 502, {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
        }, f"upstream error: {e}".encode()


def proxy_url(absolute: str) -> str:
    return "/api/proxy?url=" + urllib.parse.quote(absolute, safe="")


def rewrite_hls_playlist(body: bytes, base_url: str) -> bytes:
    """Rewrite absolute key/segment URLs (and resolve relative) through /api/proxy."""
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        text = body.decode("latin-1", errors="replace")

    base = urllib.parse.urljoin(base_url, ".")

    def abs_of(u: str) -> str:
        u = u.strip()
        if u.startswith("http://") or u.startswith("https://"):
            return u
        return urllib.parse.urljoin(base, u)

    def repl_uri(m: re.Match[str]) -> str:
        raw = m.group(1)
        return f'URI="{proxy_url(abs_of(raw))}"'

    text = URI_ATTR_RE.sub(repl_uri, text)

    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            # already handled URI= inside tags; still rewrite any other abs urls in tags
            if stripped.startswith("#") and "http" in stripped and "URI=" not in stripped:
                def repl_abs(m: re.Match[str]) -> str:
                    return proxy_url(m.group(0))

                line = ABS_URL_RE.sub(repl_abs, line)
            lines.append(line)
            continue
        # media segment line
        if stripped.startswith("http://") or stripped.startswith("https://"):
            lines.append(proxy_url(stripped))
        else:
            lines.append(proxy_url(abs_of(stripped)))
    out = "\n".join(lines) + ("\n" if text.endswith("\n") else "")
    return out.encode("utf-8")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        msg = fmt % args
        if msg.startswith('"GET /api/') or " 4" in msg or " 5" in msg:
            super().log_message(fmt, *args)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/img":
            return self.handle_img(parsed, head_only=False)
        if parsed.path == "/api/proxy":
            return self.handle_proxy(parsed, head_only=False)
        if parsed.path == "/api/hls":
            return self.handle_hls(parsed, head_only=False)
        return super().do_GET()

    def do_HEAD(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/img":
            return self.handle_img(parsed, head_only=True)
        if parsed.path == "/api/proxy":
            return self.handle_proxy(parsed, head_only=True)
        if parsed.path == "/api/hls":
            return self.handle_hls(parsed, head_only=True)
        return super().do_HEAD()

    def handle_img(self, parsed: urllib.parse.ParseResult, head_only: bool = False) -> None:
        qs = urllib.parse.parse_qs(parsed.query)
        raw = (qs.get("url") or [""])[0]
        if not raw:
            return self.json_error(400, "missing url")
        if not is_allowed(raw, ALLOWED_IMG_HOSTS):
            return self.text_error(403, "host not allowed")

        local = cache_path_for_url(raw) or cache_path_for_url(rewrite_to_public_cdn(raw))
        if local is not None:
            try:
                data = local.read_bytes()
            except OSError as e:
                return self.text_error(500, f"cache read error: {e}")
            self.send_response(200)
            self.send_header("Content-Type", guess_image_type(local))
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            self.send_header("X-Image-Cache", "HIT")
            self.end_headers()
            if not head_only:
                self.wfile.write(data)
            return

        target = rewrite_to_public_cdn(raw)
        status, headers, body = fetch_remote(target)
        if status >= 400 and target != raw:
            status, headers, body = fetch_remote(raw)

        headers = dict(headers)
        headers["X-Image-Cache"] = "MISS"
        self.send_response(status)
        for k, v in headers.items():
            if k.lower() == "content-length":
                continue
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def handle_proxy(self, parsed: urllib.parse.ParseResult, head_only: bool = False) -> None:
        qs = urllib.parse.parse_qs(parsed.query)
        raw = (qs.get("url") or [""])[0]
        media_path = (qs.get("path") or [""])[0]
        host_pref = (qs.get("host") or [""])[0].strip()
        if not raw and media_path:
            bases = list(VID_CDN_ALTS)
            if host_pref:
                if host_pref.startswith("http"):
                    bases = [host_pref.rstrip("/")] + [b for b in bases if b != host_pref.rstrip("/")]
                else:
                    bases = [f"https://{host_pref}"] + [
                        b for b in bases if not b.endswith(host_pref)
                    ]
            # try each signed host until 2xx
            last = (502, {}, b"")
            for b in bases:
                signed = sign_video_url(media_path, b)
                if not signed:
                    continue
                if not is_allowed(signed, ALLOWED_PROXY_HOSTS):
                    continue
                status, headers, body = fetch_remote(signed, timeout=45)
                last = (status, headers, body)
                if status and status < 400 and body:
                    raw = signed
                    break
            else:
                status, headers, body = last
                self.send_response(status if status else 502)
                for k, v in headers.items():
                    if k.lower() == "content-length":
                        continue
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if not head_only:
                    self.wfile.write(body)
                return
        if not raw:
            return self.json_error(400, "missing url or path")
        if not is_allowed(raw, ALLOWED_PROXY_HOSTS):
            return self.text_error(403, f"host not allowed: {urllib.parse.urlparse(raw).hostname}")

        status, headers, body = fetch_remote(raw, timeout=45)
        ctype = headers.get("Content-Type", "")
        # if upstream returned a playlist, rewrite nested urls too
        if (
            "mpegurl" in ctype
            or raw.split("?", 1)[0].endswith(".m3u8")
            or body[:64].lstrip().startswith(b"#EXTM3U")
        ):
            body = rewrite_hls_playlist(body, raw)
            headers = dict(headers)
            headers["Content-Type"] = "application/vnd.apple.mpegurl"
            headers["Cache-Control"] = "no-store"

        self.send_response(status)
        for k, v in headers.items():
            if k.lower() == "content-length":
                continue
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def handle_hls(self, parsed: urllib.parse.ParseResult, head_only: bool = False) -> None:
        """Fetch m3u8 — prefer path= (server-side sign) or url= (pre-signed)."""
        qs = urllib.parse.parse_qs(parsed.query)
        raw = (qs.get("url") or [""])[0]
        media_path = (qs.get("path") or [""])[0]
        host_pref = (qs.get("host") or [""])[0].strip()

        # Server-side signing path (reliable; avoids broken client md5)
        if media_path and not raw:
            pth = path_only(media_path)
            if not pth:
                return self.json_error(400, "bad path")
            if pth.lower().endswith((".mp4", ".webm", ".mov")):
                return self.text_error(
                    415, "not an HLS playlist; use /api/proxy for progressive video"
                )
            bases = list(VID_CDN_ALTS)
            if host_pref:
                # host_pref may be bare hostname or full origin
                if host_pref.startswith("http"):
                    bases = [host_pref.rstrip("/")] + [b for b in bases if b != host_pref.rstrip("/")]
                else:
                    bases = [f"https://{host_pref}"] + [
                        b for b in bases if not b.endswith(host_pref)
                    ]
            candidates = [sign_video_url(pth, b) for b in bases]
            status, headers, body = 502, {}, b""
            used = candidates[0] if candidates else ""
            for cand in candidates:
                status, headers, body = fetch_remote(cand, timeout=25)
                if status == 200 and body and b"#EXTM3U" in body[:64]:
                    used = cand
                    break
            if status != 200 or not body:
                self.send_response(status if status else 502)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                err = body or b"upstream m3u8 failed"
                self.send_header("Content-Length", str(len(err)))
                self.end_headers()
                if not head_only:
                    self.wfile.write(err)
                return
            rewritten = rewrite_hls_playlist(body, used)
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.apple.mpegurl")
            self.send_header("Content-Length", str(len(rewritten)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("X-HLS-Upstream", used)
            self.end_headers()
            if not head_only:
                self.wfile.write(rewritten)
            return

        if not raw:
            return self.json_error(400, "missing url or path")
        if not is_allowed(raw, ALLOWED_VIDEO_HOSTS):
            return self.text_error(403, f"host not allowed: {urllib.parse.urlparse(raw).hostname}")
        # progressive mp4 must not go through playlist rewriter
        path_l = urllib.parse.urlparse(raw).path.lower()
        if path_l.endswith((".mp4", ".webm", ".mov")):
            return self.text_error(
                415, "not an HLS playlist; use /api/proxy for progressive video"
            )

        # try primary then alternate playlist host with same path+query
        candidates = [raw]
        try:
            p = urllib.parse.urlparse(raw)
            alt_hosts = ["hls.ffxddn.cn", "op.vkjyoi.cn"]
            for h in alt_hosts:
                if p.hostname != h:
                    candidates.append(
                        urllib.parse.urlunparse(
                            (p.scheme or "https", h, p.path, p.params, p.query, p.fragment)
                        )
                    )
        except Exception:
            pass

        status, headers, body = 502, {}, b""
        used = raw
        for cand in candidates:
            status, headers, body = fetch_remote(cand, timeout=25)
            if status == 200 and body and b"#EXTM3U" in body[:64]:
                used = cand
                break

        if status != 200 or not body:
            self.send_response(status if status else 502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            err = body or b"upstream m3u8 failed"
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            if not head_only:
                self.wfile.write(err)
            return

        rewritten = rewrite_hls_playlist(body, used)
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.apple.mpegurl")
        self.send_header("Content-Length", str(len(rewritten)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-HLS-Upstream", used)
        self.end_headers()
        if not head_only:
            self.wfile.write(rewritten)

    def json_error(self, code: int, message: str) -> None:
        body = f'{{"error":"{message}"}}'.encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def text_error(self, code: int, message: str) -> None:
        body = message.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def guess_type(self, path: str):  # type: ignore[override]
        if path.endswith(".json"):
            return "application/json"
        if path.endswith(".js"):
            return "text/javascript"
        if path.endswith(".css"):
            return "text/css"
        return super().guess_type(path)


def main() -> None:
    mimetypes.add_type("application/json", ".json")
    mimetypes.add_type("text/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    cache_state = "ok" if IMAGE_CACHE_DIR.exists() else "missing"
    print(f"帖子库 → http://127.0.0.1:{PORT}/")
    print(f"  media-data: {ROOT / 'media-data'}")
    print(f"  image-cache: {IMAGE_CACHE_DIR} ({cache_state})")
    print("  hls: /api/hls + /api/proxy rewrite")
    print("  Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
        server.server_close()


if __name__ == "__main__":
    main()
