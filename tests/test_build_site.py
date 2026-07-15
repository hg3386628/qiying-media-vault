import gzip
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILD_SCRIPT = ROOT / "scripts" / "build_site.py"


def load_build_module():
    spec = importlib.util.spec_from_file_location("build_site", BUILD_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load build_site module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BuildSiteTests(unittest.TestCase):
    def setUp(self):
        self.build = load_build_module()
        self.posts = [
            {
                "pid": 101,
                "created": "2026-07-15 10:00:00",
                "image_count": 1,
                "video_count": 0,
                "media_count": 1,
                "cover": "https://imgpublic.ycomesc.live/a.jpg",
                "images": [
                    {
                        "id": 1,
                        "path": "/a.jpg",
                        "w": 1080,
                        "h": 1440,
                        "cover": "https://imgpublic.ycomesc.live/a.jpg",
                    }
                ],
                "videos": [],
            },
            {
                "pid": 202,
                "created": "2026-07-15 11:00:00",
                "image_count": 0,
                "video_count": 1,
                "media_count": 1,
                "cover": "https://imgpublic.ycomesc.live/v.jpg",
                "images": [],
                "videos": [
                    {
                        "id": 2,
                        "path": "/v.m3u8",
                        "w": 1080,
                        "h": 1920,
                        "duration": 12,
                        "status": "1",
                        "cover": "https://imgpublic.ycomesc.live/v.jpg",
                    }
                ],
            },
            {
                "pid": 303,
                "created": "2026-07-15 12:00:00",
                "image_count": 1,
                "video_count": 0,
                "media_count": 1,
                "cover": "https://imgpublic.ycomesc.live/t.jpg",
                "images": [{"id": 3, "path": "/t.jpg", "w": 800, "h": 600}],
                "videos": [],
                "title": "有标题帖子",
                "description": "详情说明",
                "author": "作者",
                "categories": ["今日吃瓜"],
                "tags": ["测试"],
            },
        ]

    def test_build_preserves_catalog_counts_and_full_details(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            manifest = self.build.build_data(self.posts, output)

            catalog = []
            for item in manifest["catalog"]["files"]:
                catalog.extend(json.loads((output / item["file"]).read_text()))

            self.assertEqual([101, 202, 303], [post["p"] for post in catalog])
            self.assertTrue(all("i" in post and "v" in post for post in catalog))
            self.assertTrue(all("images" not in post and "videos" not in post for post in catalog))
            self.assertEqual("有标题帖子", catalog[2]["t"])
            self.assertEqual(3, manifest["stats"]["posts"])
            self.assertEqual(2, manifest["stats"]["untitled_posts"])
            self.assertEqual(1, manifest["stats"]["other_images"])
            self.assertEqual(1, manifest["stats"]["other_videos"])

            bucket = 303 % manifest["details"]["buckets"]
            detail_file = output / manifest["details"]["pattern"].replace("{bucket}", f"{bucket:03d}")
            details = json.loads(detail_file.read_text())
            titled = next(post for post in details if post["p"] == 303)
            self.assertEqual(1, len(titled["i"]))
            self.assertEqual(3, titled["i"][0]["i"])

    def test_mode_shards_match_virtual_bucket_rules(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            manifest = self.build.build_data(self.posts, output)

            images = []
            for item in manifest["modes"]["images"]["files"]:
                images.extend(json.loads((output / item["file"]).read_text()))
            videos = []
            for item in manifest["modes"]["videos"]["files"]:
                videos.extend(json.loads((output / item["file"]).read_text()))

            self.assertEqual([101], [item["p"] for item in images])
            self.assertEqual([202], [item["p"] for item in videos])
            self.assertNotIn(303, {item["p"] for item in images + videos})

    def test_every_json_has_deterministic_gzip_twin(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            self.build.build_data(self.posts, output)

            json_files = sorted(output.rglob("*.json"))
            self.assertGreater(len(json_files), 0)
            for path in json_files:
                gz_path = path.with_suffix(path.suffix + ".gz")
                self.assertTrue(gz_path.exists(), f"missing {gz_path}")
                self.assertEqual(path.read_bytes(), gzip.decompress(gz_path.read_bytes()))

    def test_real_source_round_trip_counts_and_shard_limits(self):
        source = ROOT / "media-data" / "posts.json"
        posts = json.loads(source.read_text())
        expected_pids = {int(post["pid"]) for post in posts}
        expected_images = sum(len(post.get("images") or []) for post in posts)
        expected_videos = sum(len(post.get("videos") or []) for post in posts)

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            manifest = self.build.build_data(posts, output)

            catalog = []
            for item in manifest["catalog"]["files"]:
                catalog.extend(json.loads((output / item["file"]).read_text()))
            details = []
            for item in manifest["details"]["files"]:
                details.extend(json.loads((output / item["file"]).read_text()))

            self.assertEqual(expected_pids, {int(post["p"]) for post in catalog})
            self.assertEqual(expected_pids, {int(post["p"]) for post in details})
            self.assertEqual(expected_images, sum(len(post["i"]) for post in details))
            self.assertEqual(expected_videos, sum(len(post["v"]) for post in details))
            self.assertLessEqual(
                max(item["bytes"] for item in manifest["catalog"]["files"]),
                525 * 1024,
            )
            self.assertLessEqual(
                max(item["bytes"] for item in manifest["details"]["files"]),
                80 * 1024,
            )

    def test_site_cleaner_refuses_source_directories(self):
        with self.assertRaisesRegex(ValueError, "non-build directory"):
            self.build.safe_clean_output(ROOT / "scripts")
        with self.assertRaisesRegex(ValueError, "non-build directory"):
            self.build.safe_clean_output(ROOT / ".git")


if __name__ == "__main__":
    unittest.main()
