import assert from "node:assert/strict";
import test from "node:test";

import {
  MEDIA_ORDER_RANDOM,
  MEDIA_ORDER_SEQUENTIAL,
  normalizeMediaOrder,
  orderMediaItems,
  orderPostsNewestFirst,
} from "../media-order.js";

test("post order defaults to newest first across supported time fields", () => {
  const source = [
    { pid: 10, created: "2026-07-14 08:00:00" },
    { pid: 11, date_modified: "2026-07-16 08:00:00", created: "2026-07-13" },
    { pid: 12, date_published: "2026-07-15 08:00:00", created: "2026-07-17" },
    { pid: 13, date_published: "2026-07-16 08:00:00" },
  ];

  const ordered = orderPostsNewestFirst(source);
  assert.deepEqual(ordered.map((post) => post.pid), [13, 11, 12, 10]);
  assert.notEqual(ordered, source);
});

test("post order uses pid as a stable fallback when timestamps are equal or invalid", () => {
  const source = [
    { pid: 20, created: "invalid" },
    { pid: 22 },
    { pid: 21, created: "invalid" },
  ];

  assert.deepEqual(orderPostsNewestFirst(source).map((post) => post.pid), [22, 21, 20]);
});

test("sequential media order preserves source order without reusing the source array", () => {
  const source = ["a", "b", "c", "d"];
  const ordered = orderMediaItems(source, MEDIA_ORDER_SEQUENTIAL, 42);
  assert.deepEqual(ordered, source);
  assert.notEqual(ordered, source);
});

test("random media order is stable for one seed and remains a full permutation", () => {
  const source = ["a", "b", "c", "d", "e", "f"];
  const first = orderMediaItems(source, MEDIA_ORDER_RANDOM, 42);
  const second = orderMediaItems(source, MEDIA_ORDER_RANDOM, 42);
  assert.deepEqual(first, second);
  assert.deepEqual([...first].sort(), source);
  assert.notDeepEqual(first, source);
});

test("unknown media order values fall back to sequential", () => {
  assert.equal(normalizeMediaOrder("unexpected"), MEDIA_ORDER_SEQUENTIAL);
});
