#!/usr/bin/env python3
"""
Scrape post metadata from https://www.91cg1.com/archives/{pid}/

Resumable, concurrent, checkpointed.
Outputs:
  media-data/post_meta.jsonl   — one JSON object per line (append-friendly)
  media-data/post_meta.json    — final dict keyed by pid (rewritten periodically)
  media-data/scrape_state.json — progress / stats
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import ssl
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MEDIA = ROOT / "media-data"
OUT_JSONL = MEDIA / "post_meta.jsonl"
OUT_JSON = MEDIA / "post_meta.json"
STATE_PATH = MEDIA / "scrape_state.json"
POSTS_PATH = MEDIA / "posts.json"

BASE = "https://www.91cg1.com"
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
LOCK = threading.Lock()


def load_pids() -> list[int]:
    posts = json.loads(POSTS_PATH.read_text())
    # unique, newest-first (posts.json already sorted that way)
    seen = set()
    out = []
    for p in posts:
        pid = int(p["pid"])
        if pid in seen:
            continue
        seen.add(pid)
        out.append(pid)
    return out


def load_done() -> dict[str, dict]:
    done: dict[str, dict] = {}
    if OUT_JSON.exists():
        try:
            data = json.loads(OUT_JSON.read_text())
            if isinstance(data, dict):
                done.update({str(k): v for k, v in data.items()})
        except Exception:
            pass
    if OUT_JSONL.exists():
        for line in OUT_JSONL.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                pid = str(obj.get("pid"))
                if pid:
                    done[pid] = obj
            except Exception:
                continue
    return done


def fetch_html(pid: int, timeout: float = 25.0) -> tuple[int, str]:
    url = f"{BASE}/archives/{pid}/"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": f"{BASE}/",
            "Connection": "close",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
            raw = resp.read()
            # try utf-8
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


def parse_post(pid: int, status: int, html: str) -> dict:
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    base = {
        "pid": pid,
        "url": f"{BASE}/archives/{pid}/",
        "http_status": status,
        "scraped_at": now,
        "ok": False,
    }
    if status == 0 or html.startswith("__ERROR__:"):
        base["error"] = html.replace("__ERROR__:", "", 1) if html.startswith("__ERROR__:") else "network"
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

    # Prefer JSON-LD BlogPosting
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
                elif isinstance(auth, list) and auth:
                    if isinstance(auth[0], dict):
                        author = author or auth[0].get("name") or ""
                        author_url = author_url or auth[0].get("url") or ""
                sec = item.get("articleSection")
                if isinstance(sec, list):
                    for s in sec:
                        if s and s not in categories:
                            categories.append(str(s))
                elif isinstance(sec, str) and sec:
                    if sec not in categories:
                        categories.append(sec)
            if "WebPage" in types:
                # breadcrumb category (skip 首页)
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

    # HTML fallbacks
    if not title:
        m = re.search(r'<h1[^>]*itemprop="name headline"[^>]*>([^<]+)</h1>', html)
        if not m:
            m = re.search(r"<title>([^<]+)</title>", html)
        if m:
            title = m.group(1)

    title = clean_title(title)

    if not tags:
        # keywords div (post tags)
        kw_div = re.search(r'class="keywords[^"]*"(.*?)</div>', html, re.S)
        if kw_div:
            tags = [
                html_lib.unescape(t.strip())
                for t in re.findall(r"<a[^>]+>([^<]+)</a>", kw_div.group(1))
                if t.strip()
            ]
    if not tags and keywords:
        tags = [t.strip() for t in str(keywords).split(",") if t.strip()]

    if not categories:
        # post-meta category links
        meta = re.search(r'class="post-meta"[^>]*>(.*?)</ul>', html, re.S)
        if meta:
            for slug, name in re.findall(
                r'href="/category/([^"/]+)/?"[^>]*>([^<]+)', meta.group(1)
            ):
                name = html_lib.unescape(name.strip())
                if name and name not in categories:
                    categories.append(name)
                if slug and slug not in category_slugs:
                    category_slugs.append(slug)

    if not author:
        m = re.search(r'class="post-meta"[^>]*>.*?<a href="(/author/\d+/)"[^>]*>([^<]+)', html, re.S)
        if m:
            author_url = author_url or (BASE + m.group(1))
            author = html_lib.unescape(m.group(2).strip())

    if not date_published:
        m = re.search(
            r'property="article:published_time"\s+content="([^"]+)"', html
        )
        if m:
            date_published = m.group(1)

    if not description:
        m = re.search(r'name="description"\s+content="([^"]*)"', html)
        if m:
            description = html_lib.unescape(m.group(1))

    # meta keywords as backup tags
    if not keywords:
        m = re.search(r'name="keywords"\s+content="([^"]*)"', html)
        if m:
            keywords = m.group(1)

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


def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def flush_json(done: dict[str, dict]) -> None:
    # compact for size
    OUT_JSON.write_text(
        json.dumps(done, ensure_ascii=False, separators=(",", ":")) + "\n"
    )


def append_jsonl(obj: dict) -> None:
    with OUT_JSONL.open("a") as f:
        f.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")


def worker(pid: int) -> dict:
    status, html = fetch_html(pid)
    # one retry on transient errors
    if status == 0 or status >= 500:
        time.sleep(0.6)
        status, html = fetch_html(pid)
    return parse_post(pid, status, html)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--limit", type=int, default=0, help="0 = all")
    ap.add_argument("--force", action="store_true", help="re-scrape even if done")
    ap.add_argument("--only-missing", action="store_true", help="skip ok results only; retry non-ok")
    args = ap.parse_args()

    MEDIA.mkdir(exist_ok=True)
    pids = load_pids()
    if args.limit and args.limit > 0:
        pids = pids[: args.limit]

    done = load_done()
    if args.force:
        todo = pids
    elif args.only_missing:
        todo = [
            pid
            for pid in pids
            if str(pid) not in done or not done[str(pid)].get("ok")
        ]
    else:
        todo = [pid for pid in pids if str(pid) not in done]

    print(f"total pids={len(pids)} done={len(done)} todo={len(todo)} workers={args.workers}")
    if not todo:
        print("nothing to do")
        flush_json(done)
        return

    state = {
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total": len(pids),
        "todo": len(todo),
        "done": len(done),
        "ok": sum(1 for v in done.values() if v.get("ok")),
        "missing": sum(1 for v in done.values() if v.get("missing")),
        "errors": sum(1 for v in done.values() if v.get("error")),
        "finished": False,
    }
    save_state(state)

    t0 = time.time()
    processed = 0
    ok_n = miss_n = err_n = 0

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(worker, pid): pid for pid in todo}
        for fut in as_completed(futs):
            pid = futs[fut]
            try:
                obj = fut.result()
            except Exception as e:
                obj = {
                    "pid": pid,
                    "url": f"{BASE}/archives/{pid}/",
                    "http_status": 0,
                    "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "ok": False,
                    "error": f"worker:{e}",
                }

            with LOCK:
                done[str(pid)] = obj
                append_jsonl(obj)
                processed += 1
                if obj.get("ok"):
                    ok_n += 1
                elif obj.get("missing"):
                    miss_n += 1
                else:
                    err_n += 1

                if processed % 50 == 0 or processed == len(todo):
                    elapsed = max(0.001, time.time() - t0)
                    rate = processed / elapsed
                    remain = len(todo) - processed
                    eta = remain / rate if rate else 0
                    state.update(
                        {
                            "done": len(done),
                            "processed_this_run": processed,
                            "ok_this_run": ok_n,
                            "missing_this_run": miss_n,
                            "errors_this_run": err_n,
                            "ok": sum(1 for v in done.values() if v.get("ok")),
                            "missing": sum(1 for v in done.values() if v.get("missing")),
                            "errors": sum(1 for v in done.values() if v.get("error")),
                            "rate_per_sec": round(rate, 2),
                            "eta_sec": int(eta),
                            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        }
                    )
                    save_state(state)
                    flush_json(done)
                    print(
                        f"[{processed}/{len(todo)}] ok={ok_n} miss={miss_n} err={err_n} "
                        f"{rate:.1f}/s eta={eta/60:.1f}m last_pid={pid} title={(obj.get('title') or obj.get('error') or ('404' if obj.get('missing') else ''))[:40]}"
                    )

    state["finished"] = True
    state["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    state["elapsed_sec"] = int(time.time() - t0)
    save_state(state)
    flush_json(done)
    print(
        f"DONE ok={ok_n} missing={miss_n} errors={err_n} "
        f"total_done={len(done)} elapsed={(time.time()-t0)/60:.1f}m"
    )
    print(f"wrote {OUT_JSON} and {OUT_JSONL}")


if __name__ == "__main__":
    main()
