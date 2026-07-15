#!/usr/bin/env python3
"""
把 posts.json 里的图片（及视频封面）缓存到移动硬盘。

默认目录：
  /Volumes/app/cdn-data-cache/images/<path...>

用法：
  python3 cache_images.py
  python3 cache_images.py --workers 16
  python3 cache_images.py --limit 100          # 试跑
  python3 cache_images.py --only-missing
  python3 cache_images.py --cache-root /Volumes/app/cdn-data-cache

可随时 Ctrl+C；已下好的文件会跳过（按 size>0）。
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent
POSTS_JSON = ROOT / "media-data" / "posts.json"
DEFAULT_CACHE_ROOT = Path("/Volumes/app/cdn-data-cache")
IMG_PUBLIC = "https://imgpublic.ycomesc.live"
IMG_FALLBACKS = [
    "https://imgpublic.ycomesc.live",
    "https://pic.jjlxoi.cn",
    "https://pic.uforxk.cn",
    "https://image.qzycbu.cn",
    "https://new.qzycbu.cn",
    "https://pwa.eisees.com",
]

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

_print_lock = threading.Lock()
_stats_lock = threading.Lock()


def log(msg: str) -> None:
    with _print_lock:
        print(msg, flush=True)


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
    # drop query/fragment leftovers
    s = s.split("?", 1)[0].split("#", 1)[0]
    return s


def safe_relpath(p: str) -> Path | None:
    """Map CDN path to a relative path under images/, block traversal."""
    p = path_only(p)
    if not p or p == "/":
        return None
    rel = p.lstrip("/")
    parts = Path(rel).parts
    if any(part in ("", ".", "..") for part in parts):
        return None
    return Path(*parts)


def collect_paths(posts: list[dict]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for post in posts:
        for im in post.get("images") or []:
            for key in ("path", "cover"):
                p = path_only(im.get(key) or "")
                if p and p not in seen:
                    seen.add(p)
                    out.append(p)
        for v in post.get("videos") or []:
            for key in ("cover", "cover_path"):
                p = path_only(v.get(key) or "")
                if p and p not in seen:
                    seen.add(p)
                    out.append(p)
        # post-level cover if present
        p = path_only(post.get("cover") or "")
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return out


def is_cached(dest: Path) -> bool:
    try:
        return dest.is_file() and dest.stat().st_size > 0
    except OSError:
        return False


def fetch_bytes(url: str, timeout: int = 45) -> tuple[int, bytes]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Referer": "",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
            status = getattr(resp, "status", 200) or 200
            data = resp.read()
            return status, data
    except urllib.error.HTTPError as e:
        body = e.read() if hasattr(e, "read") else b""
        return e.code, body
    except Exception:
        return 0, b""


def download_one(
    path: str,
    images_dir: Path,
    timeout: int,
) -> tuple[str, str, int]:
    """
    Returns (path, status, bytes)
    status: ok | skip | fail | bad
    """
    rel = safe_relpath(path)
    if rel is None:
        return path, "bad", 0
    dest = images_dir / rel
    if is_cached(dest):
        return path, "skip", dest.stat().st_size

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")

    last_err = ""
    for base in IMG_FALLBACKS:
        url = f"{base}{path}"
        status, body = fetch_bytes(url, timeout=timeout)
        if status == 200 and body and len(body) > 32:
            # crude reject of HTML error pages
            head = body[:200].lstrip().lower()
            if head.startswith(b"<!doctype") or head.startswith(b"<html"):
                last_err = "html"
                continue
            try:
                tmp.write_bytes(body)
                tmp.replace(dest)
                return path, "ok", len(body)
            except OSError as e:
                last_err = str(e)
                try:
                    if tmp.exists():
                        tmp.unlink()
                except OSError:
                    pass
                return path, "fail", 0
        last_err = f"http_{status}"
    return path, "fail", 0


def human(n: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    f = float(n)
    for u in units:
        if f < 1024 or u == units[-1]:
            return f"{f:.1f}{u}" if u != "B" else f"{int(f)}B"
        f /= 1024
    return f"{n}B"


def main(argv: Iterable[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Cache CDN images to external drive")
    ap.add_argument(
        "--cache-root",
        type=Path,
        default=DEFAULT_CACHE_ROOT,
        help=f"cache root (default: {DEFAULT_CACHE_ROOT})",
    )
    ap.add_argument("--posts", type=Path, default=POSTS_JSON)
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--limit", type=int, default=0, help="only first N paths (0=all)")
    ap.add_argument("--timeout", type=int, default=45)
    ap.add_argument(
        "--only-missing",
        action="store_true",
        help="skip already-cached files during planning (same as default behavior)",
    )
    ap.add_argument(
        "--force",
        action="store_true",
        help="re-download even if local file exists",
    )
    args = ap.parse_args(list(argv) if argv is not None else None)

    cache_root: Path = args.cache_root
    images_dir = cache_root / "images"
    if not cache_root.parent.exists() and str(cache_root).startswith("/Volumes/app"):
        log(f"[error] 移动硬盘未挂载：{cache_root.parent} 不存在")
        return 2

    if not args.posts.is_file():
        log(f"[error] 找不到 {args.posts}")
        return 2

    log(f"读取 {args.posts} …")
    posts = json.loads(args.posts.read_text(encoding="utf-8"))
    if not isinstance(posts, list):
        log("[error] posts.json 格式不是 list")
        return 2

    paths = collect_paths(posts)
    log(f"共 {len(paths):,} 个唯一图片 path")

    if args.limit and args.limit > 0:
        paths = paths[: args.limit]
        log(f"limit → {len(paths):,}")

    todo: list[str] = []
    skipped = 0
    for p in paths:
        rel = safe_relpath(p)
        if rel is None:
            continue
        dest = images_dir / rel
        if not args.force and is_cached(dest):
            skipped += 1
            continue
        todo.append(p)

    log(f"已缓存跳过 {skipped:,} · 待下载 {len(todo):,}")
    log(f"目标目录 {images_dir}")
    log(f"workers={args.workers} timeout={args.timeout}s")

    if not todo:
        log("没有需要下载的文件。")
        # write manifest anyway
        _write_manifest(cache_root, paths, images_dir)
        return 0

    images_dir.mkdir(parents=True, exist_ok=True)

    stats = {"ok": 0, "skip": 0, "fail": 0, "bad": 0, "bytes": 0}
    fails: list[str] = []
    t0 = time.time()
    done = 0
    total = len(todo)

    def tick(path: str, status: str, nbytes: int) -> None:
        nonlocal done
        with _stats_lock:
            stats[status] = stats.get(status, 0) + 1
            if status == "ok":
                stats["bytes"] += nbytes
            if status == "fail":
                fails.append(path)
            done += 1
            if done % 50 == 0 or done == total:
                elapsed = max(0.001, time.time() - t0)
                rate = done / elapsed
                log(
                    f"[{done:,}/{total:,}] ok={stats['ok']:,} fail={stats['fail']:,} "
                    f"skip={stats['skip']:,} · {human(stats['bytes'])} · "
                    f"{rate:.1f}/s · ETA {((total - done) / rate):.0f}s"
                )

    try:
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
            futs = {
                ex.submit(download_one, p, images_dir, args.timeout): p for p in todo
            }
            for fut in as_completed(futs):
                try:
                    path, status, nbytes = fut.result()
                except Exception as e:
                    path = futs[fut]
                    status, nbytes = "fail", 0
                    log(f"  ! exception {path}: {e}")
                tick(path, status, nbytes)
    except KeyboardInterrupt:
        log("\n[中断] 已下载的文件会保留，下次可 --only-missing 续传")
        _write_manifest(cache_root, paths, images_dir)
        _write_fails(cache_root, fails)
        return 130

    elapsed = time.time() - t0
    log(
        f"完成 · ok={stats['ok']:,} fail={stats['fail']:,} skip={stats['skip']:,} "
        f"bad={stats['bad']:,} · 新写入 {human(stats['bytes'])} · {elapsed:.1f}s"
    )
    _write_manifest(cache_root, paths, images_dir)
    _write_fails(cache_root, fails)
    if stats["fail"]:
        log(f"失败列表: {cache_root / 'failed_images.txt'} ({len(fails)} 条)")
    return 0 if stats["fail"] == 0 else 1


def _write_manifest(cache_root: Path, paths: list[str], images_dir: Path) -> None:
    cache_root.mkdir(parents=True, exist_ok=True)
    cached = 0
    for p in paths:
        rel = safe_relpath(p)
        if rel and is_cached(images_dir / rel):
            cached += 1
    meta = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "total_paths": len(paths),
        "cached": cached,
        "images_dir": str(images_dir),
        "cdn": IMG_PUBLIC,
    }
    (cache_root / "manifest.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log(f"manifest: cached {cached:,}/{len(paths):,} → {cache_root / 'manifest.json'}")


def _write_fails(cache_root: Path, fails: list[str]) -> None:
    if not fails:
        return
    cache_root.mkdir(parents=True, exist_ok=True)
    (cache_root / "failed_images.txt").write_text(
        "\n".join(fails) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    sys.exit(main())
