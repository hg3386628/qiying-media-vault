#!/usr/bin/env python3
"""Build the deployable static site and compact, gzip-ready media shards."""

from __future__ import annotations

import argparse
import gzip
import json
import shutil
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "media-data" / "posts.json"
DEFAULT_OUTPUT = ROOT / "dist"

CATALOG_SHARD_SIZE = 1_000
DETAIL_BUCKETS = 96
IMAGE_SHARD_SIZE = 1_500
VIDEO_SHARD_SIZE = 1_000

STATIC_FILES = ("index.html", "styles.css", "app.js", "feed-policy.js")
VENDOR_FILES = ("hls.min.js", "anime.iife.min.js")


def compact_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode(
        "utf-8"
    )


def write_json_pair(path: Path, value: Any) -> dict[str, int | str]:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = compact_json(value)
    zipped = gzip.compress(raw, compresslevel=9, mtime=0)
    path.write_bytes(raw)
    path.with_suffix(path.suffix + ".gz").write_bytes(zipped)
    return {
        "file": path.as_posix(),
        "count": len(value) if hasattr(value, "__len__") else 0,
        "bytes": len(raw),
        "gzip_bytes": len(zipped),
    }


def chunks(items: list[Any], size: int) -> Iterable[list[Any]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def has_real_title(post: dict[str, Any]) -> bool:
    title = str(post.get("title") or "").strip()
    return bool(title and title not in {"未命名文档", "无标题"})


def compact_cover(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.startswith("/"):
        return raw
    try:
        parsed = urlparse(raw)
    except ValueError:
        return raw
    if parsed.hostname == "imgpublic.ycomesc.live" and parsed.path:
        return parsed.path
    return raw


def add_if(record: dict[str, Any], key: str, value: Any) -> None:
    if value not in (None, "", [], {}):
        record[key] = value


def catalog_record(post: dict[str, Any]) -> dict[str, Any]:
    record: dict[str, Any] = {
        "p": int(post["pid"]),
        "i": int(post.get("image_count") or 0),
        "v": int(post.get("video_count") or 0),
    }
    add_if(record, "c", post.get("created"))
    add_if(record, "r", compact_cover(post.get("cover")))
    add_if(record, "t", post.get("title"))
    add_if(record, "d", post.get("description"))
    add_if(record, "a", post.get("author"))
    add_if(record, "u", post.get("date_published"))
    add_if(record, "m", post.get("date_modified"))
    add_if(record, "k", post.get("categories"))
    add_if(record, "g", post.get("tags"))
    return record


def compact_image(media: dict[str, Any]) -> dict[str, Any]:
    record: dict[str, Any] = {
        "i": media.get("id"),
        "p": media.get("path") or "",
        "w": int(media.get("w") or 0),
        "h": int(media.get("h") or 0),
    }
    cover = compact_cover(media.get("cover"))
    path = str(record["p"] or "")
    if cover and cover != path:
        record["c"] = cover
    return record


def compact_video(media: dict[str, Any]) -> dict[str, Any]:
    record: dict[str, Any] = {
        "i": media.get("id"),
        "p": media.get("path") or "",
        "w": int(media.get("w") or 0),
        "h": int(media.get("h") or 0),
        "d": int(media.get("duration") or 0),
    }
    add_if(record, "s", media.get("status"))
    add_if(record, "c", compact_cover(media.get("cover") or media.get("cover_path")))
    return record


def detail_record(post: dict[str, Any]) -> dict[str, Any]:
    return {
        "p": int(post["pid"]),
        "i": [compact_image(item) for item in post.get("images") or []],
        "v": [compact_video(item) for item in post.get("videos") or []],
    }


def post_time(post: dict[str, Any]) -> str:
    return str(post.get("date_published") or post.get("date_modified") or post.get("created") or "")


def image_feed_record(post: dict[str, Any], media: dict[str, Any]) -> dict[str, Any]:
    item = compact_image(media)
    record = {
        "p": int(post["pid"]),
        "c": post.get("created") or "",
        "n": int(post.get("image_count") or 0),
        "v": int(post.get("video_count") or 0),
        "i": item["i"],
        "q": item["p"],
        "w": item["w"],
        "h": item["h"],
    }
    add_if(record, "r", item.get("c"))
    return record


def video_feed_record(post: dict[str, Any], media: dict[str, Any]) -> dict[str, Any]:
    item = compact_video(media)
    record = {
        "p": int(post["pid"]),
        "c": post.get("created") or "",
        "n": int(post.get("image_count") or 0),
        "v": int(post.get("video_count") or 0),
        "i": item["i"],
        "q": item["p"],
        "w": item["w"],
        "h": item["h"],
        "d": item["d"],
    }
    add_if(record, "s", item.get("s"))
    add_if(record, "r", item.get("c"))
    return record


def relative_entry(root: Path, entry: dict[str, int | str]) -> dict[str, int | str]:
    result = dict(entry)
    result["file"] = Path(str(entry["file"])).relative_to(root).as_posix()
    return result


def write_shards(
    root: Path, directory: str, prefix: str, items: list[Any], shard_size: int
) -> list[dict[str, int | str]]:
    files = []
    for index, part in enumerate(chunks(items, shard_size)):
        path = root / directory / f"{prefix}-{index:03d}.json"
        files.append(relative_entry(root, write_json_pair(path, part)))
    return files


def build_data(posts: list[dict[str, Any]], output: Path) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)

    catalog = [catalog_record(post) for post in posts]
    catalog_files = write_shards(
        output, "catalog", "catalog", catalog, CATALOG_SHARD_SIZE
    )

    detail_buckets: list[list[dict[str, Any]]] = [[] for _ in range(DETAIL_BUCKETS)]
    for post in posts:
        detail_buckets[int(post["pid"]) % DETAIL_BUCKETS].append(detail_record(post))
    detail_files = []
    for bucket, records in enumerate(detail_buckets):
        records.sort(key=lambda item: int(item["p"]))
        entry = write_json_pair(output / "details" / f"details-{bucket:03d}.json", records)
        detail_files.append(relative_entry(output, entry))

    untitled = [post for post in posts if not has_real_title(post)]
    image_posts = [post for post in untitled if int(post.get("video_count") or 0) == 0 and int(post.get("image_count") or 0) > 0]
    video_posts = [post for post in untitled if int(post.get("video_count") or 0) > 0]
    image_posts.sort(key=lambda post: (post_time(post), int(post["pid"])), reverse=True)
    video_posts.sort(key=lambda post: (post_time(post), int(post["pid"])), reverse=True)

    image_items = [
        image_feed_record(post, media)
        for post in image_posts
        for media in (post.get("images") or [])
    ]
    video_items = [
        video_feed_record(post, media)
        for post in video_posts
        for media in (post.get("videos") or [])
    ]

    image_files = write_shards(
        output, "modes/images", "images", image_items, IMAGE_SHARD_SIZE
    )
    video_files = write_shards(
        output, "modes/videos", "videos", video_items, VIDEO_SHARD_SIZE
    )

    manifest: dict[str, Any] = {
        "schema": 2,
        "encoding": "compact-v1",
        "compression": "gzip",
        "stats": {
            "posts": len(posts),
            "titled_posts": sum(1 for post in posts if has_real_title(post)),
            "untitled_posts": len(untitled),
            "other_images": len(image_posts),
            "other_videos": len(video_posts),
            "images": sum(int(post.get("image_count") or 0) for post in posts),
            "videos": sum(int(post.get("video_count") or 0) for post in posts),
        },
        "catalog": {"shard_size": CATALOG_SHARD_SIZE, "files": catalog_files},
        "details": {
            "buckets": DETAIL_BUCKETS,
            "pattern": "details/details-{bucket}.json",
            "files": detail_files,
        },
        "modes": {
            "images": {"items": len(image_items), "files": image_files},
            "videos": {"items": len(video_items), "files": video_files},
        },
    }
    write_json_pair(output / "manifest.json", manifest)
    return manifest


def copy_static_files(output: Path) -> None:
    for name in STATIC_FILES:
        shutil.copy2(ROOT / name, output / name)
    vendor_out = output / "vendor"
    vendor_out.mkdir(parents=True, exist_ok=True)
    for name in VENDOR_FILES:
        shutil.copy2(ROOT / "vendor" / name, vendor_out / name)
    (output / ".nojekyll").write_text("", encoding="utf-8")


def safe_clean_output(output: Path) -> None:
    resolved = output.resolve()
    allowed = DEFAULT_OUTPUT.resolve()
    if resolved != allowed:
        raise ValueError(f"refusing to clean non-build directory: {resolved}; expected {allowed}")
    if resolved.exists():
        shutil.rmtree(resolved)


def build_site(source: Path, output: Path) -> dict[str, Any]:
    safe_clean_output(output)
    output.mkdir(parents=True, exist_ok=True)
    posts = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(posts, list):
        raise ValueError("posts source must contain a JSON array")
    copy_static_files(output)
    manifest = build_data(posts, output / "media-data" / "v2")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    manifest = build_site(args.source.resolve(), args.output.resolve())
    print(
        json.dumps(
            {
                "output": str(args.output.resolve()),
                "posts": manifest["stats"]["posts"],
                "catalog_shards": len(manifest["catalog"]["files"]),
                "detail_buckets": manifest["details"]["buckets"],
                "image_shards": len(manifest["modes"]["images"]["files"]),
                "video_shards": len(manifest["modes"]["videos"]["files"]),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
