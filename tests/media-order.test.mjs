import assert from "node:assert/strict";
import test from "node:test";

import {
  MEDIA_ORDER_RANDOM,
  MEDIA_ORDER_SEQUENTIAL,
  normalizeMediaOrder,
  orderMediaItems,
} from "../media-order.js";

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
