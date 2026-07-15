import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
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
