import assert from "node:assert/strict";
import test from "node:test";

import {
  MEDIA_ORDER_RANDOM,
  MEDIA_ORDER_SEQUENTIAL,
  normalizeMediaOrder,
  orderMediaItems,
  orderPostsNewestFirst,
} from "../media-order.js";

test("post order uses date_published only and keeps missing dates at the end", () => {
  const source = [
    { pid: 10, created: "2026-07-18 08:00:00" },
    { pid: 11, date_modified: "2026-07-19 08:00:00", created: "2026-07-17" },
    { pid: 12, date_published: "2026-07-15 08:00:00", created: "2026-07-17" },
    { pid: 13, date_published: "2026-07-16 08:00:00" },
    { pid: 14, date_published: "invalid", created: "2026-07-20 08:00:00" },
  ];

  const ordered = orderPostsNewestFirst(source);
  assert.deepEqual(ordered.map((post) => post.pid), [13, 12, 14, 11, 10]);
  assert.notEqual(ordered, source);
});

test("post order uses pid when date_published is equal or unavailable", () => {
  const source = [
    { pid: 20, date_published: "invalid" },
    { pid: 22 },
    { pid: 21, date_modified: "2099-01-01T00:00:00Z" },
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
