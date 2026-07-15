export const FEED_SOUND_KEY = "posts.feedSoundEnabled";

export function listFeedPlayerIndexes(players) {
  return Array.from(players.keys());
}

export function readFeedSoundEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(FEED_SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFeedSoundEnabled(enabled, storage = globalThis.localStorage) {
  try {
    storage?.setItem(FEED_SOUND_KEY, enabled ? "1" : "0");
  } catch {}
}
