import assert from "node:assert/strict";
import test from "node:test";

import {
  listFeedPlayerIndexes,
  readFeedSoundEnabled,
  writeFeedSoundEnabled,
} from "../feed-policy.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("feed player cleanup enumerates numeric map keys without destructuring them", () => {
  const players = new Map([
    [0, { id: "first" }],
    [3, { id: "fourth" }],
  ]);
  assert.deepEqual(listFeedPlayerIndexes(players), [0, 3]);
});

test("feed sound preference stays enabled until explicitly disabled", () => {
  const storage = memoryStorage();
  assert.equal(readFeedSoundEnabled(storage), false);

  writeFeedSoundEnabled(true, storage);
  assert.equal(readFeedSoundEnabled(storage), true);

  writeFeedSoundEnabled(false, storage);
  assert.equal(readFeedSoundEnabled(storage), false);
});

test("feed sound preference tolerates unavailable browser storage", () => {
  const blockedStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readFeedSoundEnabled(blockedStorage), false);
  assert.doesNotThrow(() => writeFeedSoundEnabled(true, blockedStorage));
});
