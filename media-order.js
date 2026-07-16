export const MEDIA_ORDER_SEQUENTIAL = "sequential";
export const MEDIA_ORDER_RANDOM = "random";

export function normalizeMediaOrder(value) {
  return value === MEDIA_ORDER_RANDOM ? MEDIA_ORDER_RANDOM : MEDIA_ORDER_SEQUENTIAL;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function next() {
    value = (value + 0x6d2b79f5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleIndices(length, seed) {
  const indexes = Array.from({ length }, (_, index) => index);
  const random = mulberry32(seed);
  for (let index = length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  return indexes;
}

export function orderMediaItems(items, mode, seed) {
  const source = [...items];
  if (normalizeMediaOrder(mode) !== MEDIA_ORDER_RANDOM) return source;
  return shuffleIndices(source.length, seed).map((index) => source[index]);
}

function postTimeMs(post) {
  const raw = post.date_published || post.date_modified || post.created || "";
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function orderPostsNewestFirst(items) {
  return [...items].sort(
    (a, b) => postTimeMs(b) - postTimeMs(a) || Number(b.pid || 0) - Number(a.pid || 0)
  );
}
