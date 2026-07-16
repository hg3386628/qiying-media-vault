import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("external source and original-image entry points stay removed", () => {
  assert.equal(appSource.includes("打开源站"), false);
  assert.equal(appSource.includes("打开原图"), false);
  assert.equal(appSource.includes("打开播放地址"), true);
});

test("video feed removes only the top tip and keeps side controls", () => {
  assert.equal(appSource.includes("feed-empty-tip"), false);
  assert.equal(appSource.includes("feedTip"), false);
  assert.equal(styleSource.includes(".feed-empty-tip"), false);
  assert.equal(appSource.includes('querySelectorAll(".feed-meta, .feed-actions")'), true);
  assert.equal(appSource.includes('data-act="mute"'), true);
  assert.equal(appSource.includes('class="feed-action-lab">详情'), true);
  assert.equal(appSource.includes('data-act="next"'), true);
});

test("image lightbox supports horizontal touch swipes without hijacking vertical gestures", () => {
  assert.equal(appSource.includes("LIGHTBOX_SWIPE_MIN = 48"), true);
  assert.equal(appSource.includes('event.pointerType !== "touch"'), true);
  assert.equal(appSource.includes("Math.abs(dx) <= Math.abs(dy) * 1.2"), true);
  assert.equal(appSource.includes("openLightbox(state.browse.index + (dx < 0 ? 1 : -1))"), true);
  assert.equal(appSource.includes('lbBody?.addEventListener("pointerdown"'), true);
  assert.equal(appSource.includes('lbBody?.addEventListener("pointerup"'), true);
  assert.equal(styleSource.includes("touch-action: pan-y"), true);
});

test("main tabs and media views expose compact order controls", () => {
  assert.equal(indexSource.includes("<span>黑料</span>"), true);
  assert.equal(indexSource.includes("<span>帖子</span>"), false);
  assert.equal(appSource.includes('data-order-switch="${kind}"'), true);
  assert.equal(appSource.includes('setStatsMediaOrderControl("posts", route)'), true);
  assert.equal(appSource.includes('kind === "posts" ? "最新" : "顺序"'), true);
  assert.equal(appSource.includes('mediaOrderControlHtml("images", orderMode)'), true);
  assert.equal(appSource.includes('setStatsMediaOrderControl("videos", route)'), true);
  assert.equal(styleSource.includes(".media-order-switch.compact"), true);
});
