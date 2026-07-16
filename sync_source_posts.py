#!/usr/bin/env python3
"""
从源站 https://www.91cg1.com 发现本地缺失的帖子，抓取媒体 + 元数据，追加进 posts.json。

策略：
  1. RSS feed + 列表页 /page/{n}/ 收集 pid
  2. 过滤本地已有 pid
  3. 抓取 /archives/{pid}/ 解析标题/标签/图片/视频
  4. 合并进 media-data/posts.json（并更新 post_meta）

用法：
  python3 sync_source_posts.py                 # 增量：直到连续几页无新帖
  python3 sync_source_posts.py --max-pages 20
  python3 sync_source_posts.py --limit 50      # 最多追加 50 帖
  python3 sync_source_posts.py --dry-run
  python3 sync_source_posts.py --pids 118374,111277
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
MEDIA = ROOT / "media-data"
POSTS_PATH = MEDIA / "posts.json"
POST_META_PATH = MEDIA / "post_meta.json"
POST_META_JSONL = MEDIA / "post_meta.jsonl"
STATE_PATH = MEDIA / "sync_source_state.json"

BASE = "https://www.91cg1.com"
IMG_CDN = "https://imgpublic.ycomesc.live"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

TITLE_SUFFIX_RE = re.compile(
    r"\s*[-–—|]\s*(INJECT_TEST_blog_title|91吃瓜网).*$",
    re.I,
)
ABS_URL_RE = re.compile(r"https?://[^\s\"'<>]+")
PID_RE = re.compile(r"/archives/(\d+)/?")


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    print(msg, flush=True)


def fetch(url: str, timeout: float = 30.0) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": f"{BASE}/",
            "Connection": "close",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
            raw = resp.read()
            text = raw.decode("utf-8", "ignore")
            return getattr(resp, "status", 200) or 200, text
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore") if e.fp else ""
        return e.code, body
    except Exception as e:
        return 0, f"__ERROR__:{type(e).__name__}:{e}"


def clean_title(t: str) -> str:
    t = html_lib.unescape((t or "").strip())
    t = TITLE_SUFFIX_RE.sub("", t).strip()
    t = re.sub(r"\s+", " ", t)
    return t


def load_local_pids() -> set[int]:
    posts = json.loads(POSTS_PATH.read_text(encoding="utf-8"))
    return {int(p["pid"]) for p in posts if p.get("pid") is not None}


def load_posts() -> list[dict[str, Any]]:
    return json.loads(POSTS_PATH.read_text(encoding="utf-8"))


def load_post_meta() -> dict[str, dict]:
    if not POST_META_PATH.exists():
        return {}
    try:
        data = json.loads(POST_META_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return {str(k): v for k, v in data.items()}
    except Exception:
        pass
    return {}


def discover_from_feed() -> list[int]:
    status, body = fetch(f"{BASE}/feed/")
    if status != 200:
        log(f"[feed] http {status}")
        return []
    pids = list(dict.fromkeys(int(x) for x in PID_RE.findall(body)))
    log(f"[feed] {len(pids)} pids")
    return pids


def discover_from_page(page: int) -> list[int]:
    url = f"{BASE}/page/{page}/" if page > 1 else f"{BASE}/"
    status, body = fetch(url)
    if status != 200:
        log(f"[page {page}] http {status}")
        return []
    # listing pages often emit each pid twice (cover + title)
    pids = list(dict.fromkeys(int(x) for x in PID_RE.findall(body)))
    return pids


def discover_new_pids(
    local: set[int],
    max_pages: int,
    stop_after_empty: int,
    extra: list[int] | None = None,
) -> list[int]:
    found: list[int] = []
    seen: set[int] = set()

    def add_many(pids: list[int], source: str) -> int:
        n = 0
        for pid in pids:
            if pid in local or pid in seen:
                continue
            seen.add(pid)
            found.append(pid)
            n += 1
        if n:
            log(f"[{source}] +{n} new (total new {len(found)})")
        return n

    if extra:
        add_many(extra, "cli")

    add_many(discover_from_feed(), "feed")

    empty_streak = 0
    for page in range(1, max_pages + 1):
        pids = discover_from_page(page)
        if not pids:
            empty_streak += 1
            log(f"[page {page}] empty/fail streak={empty_streak}")
            if empty_streak >= stop_after_empty:
                break
            continue
        new_n = add_many(pids, f"page {page}")
        hit = sum(1 for p in pids if p in local)
        log(f"[page {page}] listed={len(pids)} already_local={hit} new={new_n}")
        if new_n == 0:
            empty_streak += 1
        else:
            empty_streak = 0
        if empty_streak >= stop_after_empty:
            log(f"stop: {stop_after_empty} consecutive pages with no new pids")
            break
        time.sleep(0.25)

    return found


def parse_meta(pid: int, status: int, html: str) -> dict[str, Any]:
    """Reuse the same meta fields as scrape_post_meta.py (lightweight copy)."""
    base: dict[str, Any] = {
        "pid": pid,
        "url": f"{BASE}/archives/{pid}/",
        "http_status": status,
        "scraped_at": now_iso(),
        "ok": False,
    }
    if status == 0 or html.startswith("__ERROR__:"):
        base["error"] = (
            html.replace("__ERROR__:", "", 1)
            if html.startswith("__ERROR__:")
            else "network"
        )
        return base
    if status == 404 or "404 页面不存在" in html or "<title>404" in html:
        base["http_status"] = 404
        base["missing"] = True
        return base
    if status != 200:
        base["error"] = f"http_{status}"
        return base

    title = ""
    description = ""
    author = ""
    author_url = ""
    date_published = ""
    date_modified = ""
    categories: list[str] = []
    category_slugs: list[str] = []
    tags: list[str] = []
    keywords = ""

    for block in re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', html, re.S | re.I
    ):
        try:
            data = json.loads(block)
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if not isinstance(item, dict):
                continue
            t = item.get("@type")
            types = t if isinstance(t, list) else [t]
            if "BlogPosting" in types or "Article" in types:
                title = title or item.get("headline") or item.get("name") or ""
                description = description or item.get("description") or ""
                date_published = date_published or item.get("datePublished") or ""
                date_modified = date_modified or item.get("dateModified") or ""
                keywords = keywords or item.get("keywords") or ""
                auth = item.get("author") or {}
                if isinstance(auth, dict):
                    author = author or auth.get("name") or ""
                    author_url = author_url or auth.get("url") or ""
                sec = item.get("articleSection")
                if isinstance(sec, list):
                    for s in sec:
                        if s and s not in categories:
                            categories.append(str(s))
                elif isinstance(sec, str) and sec and sec not in categories:
                    categories.append(sec)
            if "WebPage" in types:
                title = title or item.get("name") or ""
                description = description or item.get("description") or ""
                bc = item.get("breadcrumb") or {}
                els = (bc.get("itemListElement") or []) if isinstance(bc, dict) else []
                for el in els:
                    if not isinstance(el, dict):
                        continue
                    name = el.get("name") or ""
                    link = el.get("item") or ""
                    if not name or name in ("首页", title):
                        continue
                    if "/category/" in str(link):
                        if name not in categories:
                            categories.append(name)
                        m = re.search(r"/category/([^/]+)/?", str(link))
                        if m and m.group(1) not in category_slugs:
                            category_slugs.append(m.group(1))

    if not title:
        m = re.search(
            r'<h1[^>]*itemprop="name headline"[^>]*>([^<]+)</h1>', html, re.I
        )
        if not m:
            m = re.search(r"<title>([^<]+)</title>", html, re.I)
        if m:
            title = m.group(1)
    title = clean_title(title)

    m = re.search(
        r'property="article:published_time"\s+content="([^"]+)"', html, re.I
    )
    if m and not date_published:
        date_published = m.group(1)
    m = re.search(
        r'property="article:modified_time"\s+content="([^"]+)"', html, re.I
    )
    if m and not date_modified:
        date_modified = m.group(1)

    if not description:
        m = re.search(r'name="description"\s+content="([^"]*)"', html, re.I)
        if m:
            description = html_lib.unescape(m.group(1))

    if not tags:
        kw_div = re.search(r'class="keywords[^"]*"(.*?)</div>', html, re.S | re.I)
        if kw_div:
            tags = [
                html_lib.unescape(t.strip())
                for t in re.findall(r"<a[^>]+>([^<]+)</a>", kw_div.group(1))
                if t.strip()
            ]
    if not tags and keywords:
        tags = [t.strip() for t in str(keywords).split(",") if t.strip()]

    if not categories:
        for slug, name in re.findall(
            r'href="[^"]*/category/([^"/]+)/?"[^>]*>([^<]+)', html, re.I
        ):
            name = html_lib.unescape(name.strip())
            if name and name not in categories and name not in ("首页",):
                categories.append(name)
            if slug and slug not in category_slugs:
                category_slugs.append(slug)

    if not author:
        m = re.search(
            r'href="(/author/\d+/)"[^>]*>([^<]+)', html, re.I
        )
        if m:
            author_url = author_url or (BASE + m.group(1))
            author = html_lib.unescape(m.group(2).strip())

    if not title or title.startswith("404"):
        base["missing"] = True
        base["http_status"] = 404
        return base

    base.update(
        {
            "ok": True,
            "title": title,
            "description": description,
            "author": author,
            "author_url": author_url,
            "date_published": date_published,
            "date_modified": date_modified,
            "categories": categories,
            "category_slugs": category_slugs,
            "tags": tags,
            "keywords": keywords,
        }
    )
    return base


def extract_media(html: str) -> tuple[list[dict], list[dict]]:
    m = re.search(r'itemprop="articleBody"(.*)', html, re.I | re.S)
    body = m.group(1) if m else html
    for stop in ("post-near", "post-footer", "post-copyright", "comments", "comment-list"):
        i = body.find(stop)
        if i > 0:
            body = body[:i]

    images: list[dict] = []
    seen_img: set[str] = set()
    for u in ABS_URL_RE.findall(body):
        u = html_lib.unescape(u).split("#")[0]
        path = urllib.parse.urlparse(u).path
        if not re.search(r"\.(jpe?g|png|webp|gif)$", path, re.I):
            continue
        if any(
            x in path
            for x in ("/usr/themes", "/uploads/default/other/", "logo", "avatar", "emoji")
        ):
            continue
        if not any(x in path for x in ("/upload", "/xiao/", "/new/")):
            continue
        if path in seen_img:
            continue
        seen_img.add(path)
        cdn = f"{IMG_CDN}{path}"
        images.append(
            {
                "path": path,
                "w": 0,
                "h": 0,
                "cover": cdn,
                "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
        )

    videos: list[dict] = []
    seen_vid: set[str] = set()
    for _q, c in re.findall(r'data-config=(["\'])(.*?)\1', html, re.I | re.S):
        try:
            obj = json.loads(html_lib.unescape(c))
        except Exception:
            continue
        v = obj.get("video") or {}
        url = (v.get("url") or "").replace("\\/", "/")
        if not url:
            continue
        path = urllib.parse.urlparse(url).path
        if path in seen_vid:
            continue
        if not path.endswith((".m3u8", ".mp4")):
            continue
        seen_vid.add(path)
        pic = (v.get("pic") or "").replace("\\/", "/")
        cover_path = urllib.parse.urlparse(pic).path if pic else ""
        cover = pic or (f"{IMG_CDN}{cover_path}" if cover_path else "")
        videos.append(
            {
                "path": path,
                "w": 0,
                "h": 0,
                "duration": 0,
                "status": "1" if path.endswith(".m3u8") else "0",
                "cover": cover,
                "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
        )

    # fallback: bare m3u8 paths in page (escaped)
    if not videos:
        for path in re.findall(r"(/videos\d+/[a-f0-9]+/[a-f0-9]+\.m3u8)", html, re.I):
            if path in seen_vid:
                continue
            seen_vid.add(path)
            videos.append(
                {
                    "path": path,
                    "w": 0,
                    "h": 0,
                    "duration": 0,
                    "status": "1",
                    "cover": "",
                    "created": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )

    return images, videos


def build_post(pid: int, meta: dict[str, Any], images: list[dict], videos: list[dict]) -> dict[str, Any]:
    cover = ""
    if images:
        cover = images[0].get("cover") or f"{IMG_CDN}{images[0]['path']}"
    elif videos:
        cover = videos[0].get("cover") or ""

    post: dict[str, Any] = {
        "pid": pid,
        "created": time.strftime("%Y-%m-%d %H:%M:%S"),
        "image_count": len(images),
        "video_count": len(videos),
        "media_count": len(images) + len(videos),
        "cover": cover,
        "images": images,
        "videos": videos,
        "has_meta": bool(meta.get("ok")),
        "title": meta.get("title") or "",
        "description": meta.get("description") or "",
        "author": meta.get("author") or "",
        "author_url": meta.get("author_url") or "",
        "date_published": meta.get("date_published") or "",
        "date_modified": meta.get("date_modified") or "",
        "categories": meta.get("categories") or [],
        "category_slugs": meta.get("category_slugs") or [],
        "tags": meta.get("tags") or [],
        "source_url": f"{BASE}/archives/{pid}/",
    }
    return post


def scrape_one(pid: int) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    status, html = fetch(f"{BASE}/archives/{pid}/")
    if status == 0 or status >= 500:
        time.sleep(0.5)
        status, html = fetch(f"{BASE}/archives/{pid}/")
    meta = parse_meta(pid, status, html)
    if not meta.get("ok"):
        return None, meta
    images, videos = extract_media(html)
    if not images and not videos:
        # still keep meta-only post so title appears in 帖子 tab
        post = build_post(pid, meta, [], [])
        return post, meta
    return build_post(pid, meta, images, videos), meta


def backup_file(path: Path) -> Path | None:
    if not path.exists():
        return None
    ts = time.strftime("%Y%m%d-%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak-{ts}")
    bak.write_bytes(path.read_bytes())
    return bak


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Sync new posts from 91cg1 into local posts.json")
    ap.add_argument("--max-pages", type=int, default=40, help="max list pages to scan")
    ap.add_argument(
        "--stop-after-empty",
        type=int,
        default=3,
        help="stop after N consecutive pages with no new pids",
    )
    ap.add_argument("--limit", type=int, default=0, help="max new posts to scrape (0=all found)")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--pids", type=str, default="", help="comma-separated pids to force")
    ap.add_argument(
        "--no-rebuild",
        action="store_true",
        help="skip scripts/build_site.py after merge",
    )
    args = ap.parse_args(argv)

    if not POSTS_PATH.is_file():
        log(f"[error] missing {POSTS_PATH}")
        return 2

    local = load_local_pids()
    log(f"local posts: {len(local):,}")

    extra: list[int] = []
    if args.pids.strip():
        for part in args.pids.split(","):
            part = part.strip()
            if part.isdigit():
                extra.append(int(part))

    new_pids = discover_new_pids(
        local,
        max_pages=max(1, args.max_pages),
        stop_after_empty=max(1, args.stop_after_empty),
        extra=extra or None,
    )
    log(f"discovered new pids: {len(new_pids):,}")
    if not new_pids:
        log("源站相对本地没有发现新帖（在扫描范围内）。")
        STATE_PATH.write_text(
            json.dumps(
                {
                    "checked_at": now_iso(),
                    "local_posts": len(local),
                    "new_found": 0,
                    "appended": 0,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return 0

    if args.limit and args.limit > 0:
        new_pids = new_pids[: args.limit]
        log(f"limit → scrape {len(new_pids)}")

    if args.dry_run:
        log("[dry-run] sample pids: " + ", ".join(str(p) for p in new_pids[:30]))
        return 0

    posts_new: list[dict[str, Any]] = []
    meta_new: dict[str, dict] = {}
    fail = 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futs = {ex.submit(scrape_one, pid): pid for pid in new_pids}
        done = 0
        for fut in as_completed(futs):
            pid = futs[fut]
            done += 1
            try:
                post, meta = fut.result()
            except Exception as e:
                fail += 1
                log(f"  ! {pid} exception {e}")
                continue
            meta_new[str(pid)] = meta
            if post is None:
                fail += 1
                reason = meta.get("error") or ("missing" if meta.get("missing") else "fail")
                log(f"  · {pid} skip ({reason})")
            else:
                posts_new.append(post)
                log(
                    f"  + {pid} 「{(post.get('title') or '')[:36]}」 "
                    f"img={post['image_count']} vid={post['video_count']}"
                )
            if done % 20 == 0 or done == len(new_pids):
                log(f"[{done}/{len(new_pids)}] ok={len(posts_new)} fail={fail}")

    if not posts_new:
        log("没有成功抓到可追加的帖子。")
        return 1

    # merge
    bak = backup_file(POSTS_PATH)
    if bak:
        log(f"backup posts → {bak.name}")
    posts = load_posts()
    by_pid = {int(p["pid"]): i for i, p in enumerate(posts)}
    appended = 0
    updated = 0
    for post in posts_new:
        pid = int(post["pid"])
        if pid in by_pid:
            posts[by_pid[pid]] = post
            updated += 1
        else:
            posts.append(post)
            by_pid[pid] = len(posts) - 1
            appended += 1

    # newest-first by date_published then created then pid
    def sort_key(p: dict) -> tuple:
        return (
            str(p.get("date_published") or ""),
            str(p.get("created") or ""),
            int(p.get("pid") or 0),
        )

    posts.sort(key=sort_key, reverse=True)
    POSTS_PATH.write_text(
        json.dumps(posts, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    log(f"posts.json written: total={len(posts):,} appended={appended} updated={updated}")

    # post_meta merge
    meta_all = load_post_meta()
    for k, v in meta_new.items():
        meta_all[k] = v
    backup_file(POST_META_PATH)
    POST_META_PATH.write_text(
        json.dumps(meta_all, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    with POST_META_JSONL.open("a", encoding="utf-8") as f:
        for v in meta_new.values():
            f.write(json.dumps(v, ensure_ascii=False, separators=(",", ":")) + "\n")
    log(f"post_meta updated (+{len(meta_new)})")

    # also append to raw media shards for completeness (optional light write)
    # skip heavy images_*.json rewrite; posts.json is the source of truth for UI.

    state = {
        "checked_at": now_iso(),
        "elapsed_s": round(time.time() - t0, 1),
        "local_before": len(local),
        "new_found": len(new_pids),
        "scraped_ok": len(posts_new),
        "scraped_fail": fail,
        "appended": appended,
        "updated": updated,
        "total_posts": len(posts),
        "sample_pids": [int(p["pid"]) for p in posts_new[:20]],
    }
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"state → {STATE_PATH}")

    if not args.no_rebuild:
        build = ROOT / "scripts" / "build_site.py"
        if build.is_file():
            log("rebuild dist (scripts/build_site.py) …")
            import subprocess

            r = subprocess.run(
                [sys.executable, str(build)],
                cwd=str(ROOT),
            )
            if r.returncode != 0:
                log(f"[warn] build_site exit {r.returncode}")
            else:
                log("build_site ok")
                # also expose v2 under media-data/v2 for app.js path
                src = ROOT / "dist" / "media-data" / "v2"
                dst = MEDIA / "v2"
                if src.is_dir():
                    import shutil

                    if dst.exists():
                        shutil.rmtree(dst)
                    shutil.copytree(src, dst)
                    log(f"copied dist media-data/v2 → {dst}")

    log(
        f"完成 · 追加 {appended} · 更新 {updated} · 失败 {fail} · "
        f"耗时 {time.time() - t0:.1f}s · 总数 {len(posts):,}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
